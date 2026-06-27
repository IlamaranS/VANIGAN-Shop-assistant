from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
import os
import json
import base64
import urllib.request
import urllib.parse
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel

from typing import Optional
from sqlalchemy import text
import models, database
from ai_service import process_chat_message

# Explicitly force table generation on startup for Neon PostgreSQL / active database
try:
    models.Base.metadata.create_all(bind=database.engine)
except Exception as e:
    print(f"Warning: Database initialization encountered an error: {e}")

# Ensure user_id column exists
try:
    with database.engine.connect() as conn:
        conn.execute(text("ALTER TABLE jobs ADD COLUMN user_id INTEGER"))
        conn.commit()
except Exception:
    pass # Column likely exists

try:
    with database.engine.connect() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN password VARCHAR"))
        conn.commit()
except Exception:
    pass # Column likely exists

models.Base.metadata.create_all(bind=database.engine)

with database.SessionLocal() as db:
    demo_user = db.query(models.User).filter(models.User.email == "demo@vanigan.com").first()
    if not demo_user:
        new_demo = models.User(email="demo@vanigan.com", password="demo_password", shop_name="Maran Electronics Demo", business_type="Electronics Repair")
        db.add(new_demo)
        db.commit()

app = FastAPI(title="VANIGAN API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")

@app.get("/")
async def read_index():
    return FileResponse("frontend/index.html")

class ChatRequest(BaseModel):
    message: str
    user_id: Optional[int] = None

class SignupRequest(BaseModel):
    email: str
    password: str
    shop_name: str
    business_type: str

class LoginRequest(BaseModel):
    email: str
    password: str

class ChatResponse(BaseModel):
    reply: str
    action: str = "none" # "none", "refresh_jobs"

# Simple in-memory store for conversational context (missing fields tracking)
# Key: "default" (since it's a single owner system for 0.5)
conversation_state = {}

def generate_job_id(db: Session):
    today_str = datetime.now().strftime("%y%m%d")
    prefix = f"VN{today_str}"
    
    last_job = db.query(models.Job).filter(models.Job.job_id.like(f"{prefix}%")).order_by(models.Job.id.desc()).first()
    
    if last_job:
        last_seq = int(last_job.job_id.split("-")[1])
        new_seq = last_seq + 1
    else:
        new_seq = 1
        
    return f"{prefix}-{new_seq:03d}"

@app.post("/api/signup")
def signup(request: SignupRequest, db: Session = Depends(database.get_db)):
    existing = db.query(models.User).filter(models.User.email == request.email).first()
    if existing:
        return {"success": False, "error": "Email already registered"}
    
    new_user = models.User(email=request.email, password=request.password, shop_name=request.shop_name, business_type=request.business_type)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"success": True, "user_id": new_user.id, "shop_name": new_user.shop_name, "business_type": new_user.business_type}

@app.post("/api/login")
def login(request: LoginRequest, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == request.email).first()
    if user and user.password == request.password:
        return {"success": True, "user_id": user.id, "shop_name": user.shop_name, "business_type": user.business_type}
    return {"success": False, "error": "Invalid email or password"}

@app.post("/api/chat", response_model=ChatResponse)
def chat_endpoint(request: ChatRequest, db: Session = Depends(database.get_db)):
    global conversation_state
    
    try:
        # Explicit Command Interception
        msg_lower = request.message.strip().lower()
        if msg_lower in ["refresh analytics", "refresh"]:
            return ChatResponse(reply="Your Analytics have been successfully refreshed!", action="show_analytics")
        if msg_lower in ["show unpaid", "switch to unpaid", "unpaid", "yet to pay"]:
            return ChatResponse(reply="Switching to the Yet To Pay view to show unpaid customers.", action="show_unpaid")
        if msg_lower in ["pending orders", "show pending orders", "switch to pending orders", "pending"]:
            return ChatResponse(reply="Switching to the Pending Orders view.", action="show_pending")
        if msg_lower in ["customer database", "show customer database", "switch to customer database", "database"]:
            return ChatResponse(reply="Switching to the Customer Database view.", action="show_database")
        if msg_lower in ["new job setup", "setup new job", "new job"]:
            return ChatResponse(reply="Great! Let's set up a new job. Start entering the details in your own words.")
        # Handle hidden payment trigger
        if request.message.startswith("TRIGGER_PAYMENT_FLOW:"):
            job_id = request.message.split(":")[1]
            job = db.query(models.Job).filter(models.Job.job_id == job_id, models.Job.user_id == request.user_id).first()
            if job:
                balance_due = float(job.total_cost or 0) - float(job.advance_paid or 0)
                conversation_state["payment_job_id"] = job_id
                conversation_state["payment_balance_due"] = balance_due
                return ChatResponse(reply=f"Task marked as done for {job.customer_name}! Did they complete the remaining payment balance of ₹{balance_due}? If yes, please type 'Yes' or the amount paid.")
            return ChatResponse(reply="Job not found.")
            
        payment_job_id = conversation_state.get("payment_job_id")
        
        # Fetch recent jobs for context
        recent_jobs = db.query(models.Job).filter(models.Job.user_id == request.user_id).order_by(models.Job.id.desc()).limit(5).all()
        context_lines = []
        for j in recent_jobs:
            bal = float(j.total_cost or 0) - float(j.advance_paid or 0)
            context_lines.append(f"Job: {j.job_id} | Customer: {j.customer_name} | Product: {j.product} | Status: {j.status} | Balance Due: {bal}")
        recent_jobs_context = "\n".join(context_lines) if context_lines else "No recent jobs."
        
        # Process message with Gemini
        try:
            extracted = process_chat_message(request.message, recent_jobs_context)
        except Exception as api_err:
            import traceback
            print("=== GEMINI API EXCEPTION ===")
            traceback.print_exc()
            print("============================")
            error_str = str(api_err)
            if "503" in error_str or "UNAVAILABLE" in error_str:
                return ChatResponse(reply="System is a bit busy right now! Please give me one moment and send your request again.")
            return ChatResponse(reply=f"Gemini API Error: {error_str}")
        
        if payment_job_id:
            if msg_lower == "yes" or msg_lower == "'yes'" or msg_lower == '"yes"':
                amount = conversation_state.get("payment_balance_due", 0)
            else:
                amount = extracted.payment_amount or extracted.advance_paid or 0
                
            job = db.query(models.Job).filter(models.Job.job_id == payment_job_id, models.Job.user_id == request.user_id).first()
            if job:
                current_advance = float(job.advance_paid or 0)
                job.advance_paid = current_advance + float(amount)
                if job.status == "Pending":
                    job.status = "Completed"
                db.commit()
                
                total_cost = float(job.total_cost or 0)
                balance = total_cost - job.advance_paid
                conversation_state.pop("payment_job_id", None)
                conversation_state.pop("payment_balance_due", None)
                
                if balance > 0:
                    reply = f"Payment updated. There is still an outstanding balance of ₹{balance} to be settled."
                else:
                    reply = "Payment updated. The balance is fully settled."
                return ChatResponse(reply=reply, action="refresh_jobs")
            else:
                conversation_state.pop("payment_job_id", None)
                conversation_state.pop("payment_balance_due", None)
                return ChatResponse(reply="Job not found.")
                
        # Check if we were waiting for missing info
        pending_job = conversation_state.get("pending_job")
        
        if extracted.intent == "cancel":
            conversation_state.pop("pending_job", None)
            conversation_state.pop("payment_job_id", None)
            return ChatResponse(reply="Okay, I've canceled the current operation. How else can I help you?", action="refresh_jobs")
        
        if extracted.intent in ["create_job", "update_job"] or pending_job:
            # 1. Search Before Creation: Intelligent Updates
            name_to_check = extracted.customer_name
            job_id_to_check = getattr(extracted, "job_id", None)
            
            if not name_to_check and pending_job:
                name_to_check = pending_job.get("customer_name")
                
            existing_jobs = []
            
            # Explicit Override for New Entries
            force_new = any(k in msg_lower for k in ["new customer", "add", "create", "new entry", "setup", "new ticket", "new job"])
            
            if force_new:
                extracted.intent = "create_job"
                
            if not force_new:
                if job_id_to_check:
                    job = db.query(models.Job).filter(models.Job.job_id.ilike(f"%{job_id_to_check}%"), models.Job.user_id == request.user_id).first()
                    if job: existing_jobs.append(job)
                elif name_to_check:
                    existing_jobs = db.query(models.Job).filter(models.Job.customer_name.ilike(f"%{name_to_check}%"), models.Job.user_id == request.user_id).order_by(models.Job.id.desc()).all()
                
            if existing_jobs and (extracted.intent == "update_job" or not pending_job):
                # Filter by extracted product/issue context if we have multiple
                if len(existing_jobs) > 1 and (extracted.product or extracted.issue):
                    filtered_jobs = []
                    for j in existing_jobs:
                        if extracted.product and extracted.product.lower() in (j.product or "").lower():
                            filtered_jobs.append(j)
                        elif extracted.issue and extracted.issue.lower() in (j.issue or "").lower():
                            filtered_jobs.append(j)
                    if filtered_jobs:
                        existing_jobs = filtered_jobs
                        
                # Level 1 & 2 Disambiguation Check
                if len(existing_jobs) > 1:
                    products = list(set([j.product for j in existing_jobs if j.product]))
                    if len(products) > 1:
                        # Level 1: Disambiguate by product
                        prod_str = f" or {name_to_check} with the ".join([f"'{p}'" for p in products[:3]])
                        return ChatResponse(reply=f"I found multiple customers named {name_to_check}. Are you referring to {name_to_check} with the {prod_str}?")
                    else:
                        # Level 2: Disambiguate by Job ID
                        job_ids_str = " or ".join([j.job_id for j in existing_jobs[:3]])
                        return ChatResponse(reply=f"I found multiple identical records for {name_to_check}. Please specify the JOB ID you want to update (e.g., {job_ids_str}).")
                
                # Single match confirmed, proceed with update
                existing_job = existing_jobs[0]
                updated_fields = []
                if extracted.phone: 
                    existing_job.phone = extracted.phone
                    updated_fields.append("Phone")
                if extracted.product: 
                    existing_job.product = extracted.product
                    updated_fields.append("Product")
                if extracted.issue: 
                    existing_job.issue = extracted.issue
                    updated_fields.append("Issue")
                if extracted.deadline: 
                    existing_job.deadline = extracted.deadline
                    updated_fields.append("Deadline")
                if extracted.total_cost > 0: 
                    existing_job.total_cost = float(extracted.total_cost)
                    updated_fields.append("Total Cost")
                if extracted.advance_paid > 0: 
                    existing_job.advance_paid = float(existing_job.advance_paid or 0) + float(extracted.advance_paid)
                    updated_fields.append("Advance Paid")
                if updated_fields:
                    db.commit()
                    conversation_state.pop("pending_job", None)
                    fields_str = ", ".join(updated_fields)
                    if extracted.total_cost > 0:
                        return ChatResponse(reply=f"Got it! I have updated {existing_job.customer_name}'s {fields_str} to ₹{existing_job.total_cost}.", action="refresh_jobs")
                    return ChatResponse(reply=f"Got it! I have updated {existing_job.customer_name}'s {fields_str}.", action="refresh_jobs")
                elif extracted.intent == "update_job":
                    return ChatResponse(reply=f"What would you like to update for {existing_job.customer_name}?")
                    
            # 2. If it's not an update (or no matching customer found), proceed with new ticket creation
            # Parse relative deadlines to absolute dates
            parsed_deadline = extracted.deadline
            if parsed_deadline:
                import re
                from datetime import timedelta, datetime
                dl_str = parsed_deadline.lower()
                days = None
                
                # Check for weeks
                week_match = re.search(r'(?:in )?(\d+) weeks?', dl_str)
                day_match = re.search(r'(?:in )?(\d+) days?', dl_str)
                
                if week_match:
                    days = int(week_match.group(1)) * 14
                elif day_match:
                    days = int(day_match.group(1))
                elif "tomorrow" in dl_str:
                    days = 1
                elif "today" in dl_str:
                    days = 0
                
                if days is not None:
                    # Explicit base date per user requirement: June 25, 2026
                    base_date = datetime(2026, 6, 25)
                    target_date = base_date + timedelta(days=days)
                    parsed_deadline = target_date.strftime("%Y-%m-%d")

            if pending_job:
                # Merge extracted info into pending job
                if extracted.customer_name: pending_job["customer_name"] = extracted.customer_name
                if extracted.phone: pending_job["phone"] = extracted.phone
                if extracted.product: pending_job["product"] = extracted.product
                if extracted.issue: pending_job["issue"] = extracted.issue
                if parsed_deadline: pending_job["deadline"] = parsed_deadline
                if extracted.total_cost > 0: pending_job["total_cost"] = extracted.total_cost
                if extracted.advance_paid > 0: pending_job["advance_paid"] = extracted.advance_paid
            else:
                pending_job = {
                    "customer_name": extracted.customer_name,
                    "phone": extracted.phone,
                    "product": extracted.product,
                    "issue": extracted.issue,
                    "deadline": parsed_deadline,
                    "total_cost": extracted.total_cost,
                    "advance_paid": extracted.advance_paid or 0.0
                }
                
            # Check for missing info
            missing = []
            if not pending_job.get("customer_name"): missing.append("Customer Name")
            if not pending_job.get("phone"): missing.append("Phone Number")
            if not pending_job.get("product") and not pending_job.get("issue"): missing.append("Product/Issue")
            if pending_job.get("total_cost", 0.0) <= 0: missing.append("Total Cost")
            
            if missing:
                conversation_state["pending_job"] = pending_job
                cust_name = pending_job.get("customer_name") or "the customer"
                prod_issue = pending_job.get("product") or pending_job.get("issue") or "device"
                
                if len(missing) >= 4:
                    reply = "Great! What is it? Start entering the details in your own words."
                else:
                    reply = f"I need a few more details to set up {cust_name}. Please provide their {', '.join(missing)} for the {prod_issue} repair."
                return ChatResponse(reply=reply)
                
            # All info present, create job
            job_id = generate_job_id(db)
            total_c = float(pending_job.get("total_cost") or 0)
            adv_p = float(pending_job.get("advance_paid") or 0)
            
            status_val = "Pending Quote" if (total_c == 0 and adv_p == 0) else "Pending"
            
            new_job = models.Job(
                user_id=request.user_id,
                job_id=job_id,
                customer_name=pending_job["customer_name"],
                phone=pending_job["phone"],
                product=pending_job["product"],
                issue=pending_job["issue"],
                deadline=pending_job["deadline"],
                total_cost=total_c,
                advance_paid=adv_p,
                status=status_val
            )
            db.add(new_job)
            db.commit()
            
            # Clear state
            conversation_state.pop("pending_job", None)
            
            reply = f"Job {job_id} successfully created for {pending_job['customer_name']}."
            # Send the new job ID in the reply so the frontend can intercept and trigger Template 1
            return ChatResponse(reply=reply, action=f"show_registration_template:{job_id}")
            
        elif extracted.intent == "search":
            if not extracted.search_query:
                return ChatResponse(reply="What would you like to search for?")
                
            query = f"%{extracted.search_query}%"
            results = db.query(models.Job).filter(models.Job.user_id == request.user_id).filter(
                (models.Job.customer_name.ilike(query)) |
                (models.Job.phone.ilike(query)) |
                (models.Job.product.ilike(query)) |
                (models.Job.issue.ilike(query))
            ).all()
            
            if not results:
                return ChatResponse(reply=f"No results found for '{extracted.search_query}'.")
                
            reply_lines = [f"Found {len(results)} results:"]
            for r in results:
                reply_lines.append(f"- **{r.job_id}**: {r.customer_name}, {r.product} (Status: {r.status})")
                
            return ChatResponse(reply="\n".join(reply_lines))
            
        elif extracted.intent == "process_payment":
            # Handle manual text-based payment (e.g. "Ramesh paid 3000")
            name = extracted.customer_name or extracted.search_query
            if not name:
                return ChatResponse(reply="Who is making the payment? Please specify the customer's name.")
            if not extracted.payment_amount:
                return ChatResponse(reply=f"How much is {name} paying?")
                
            name_query = f"%{name}%"
            jobs = db.query(models.Job).filter(models.Job.user_id == request.user_id, models.Job.customer_name.ilike(name_query)).all()
            
            # Find jobs with outstanding balance
            unpaid_jobs = [j for j in jobs if (float(j.total_cost or 0) - float(j.advance_paid or 0)) > 0]
            
            if not unpaid_jobs:
                if jobs:
                    return ChatResponse(reply=f"I found jobs for {name}, but they are all fully paid!")
                else:
                    return ChatResponse(reply=f"I couldn't find any matching jobs for {name}.")
            
            # Apply payment to the first unpaid job
            job = unpaid_jobs[0]
            current_advance = float(job.advance_paid or 0)
            job.advance_paid = current_advance + float(extracted.payment_amount)
            if job.status == "Pending":
                job.status = "Completed"
            db.commit()
            
            total_cost = float(job.total_cost or 0)
            balance = total_cost - job.advance_paid
            
            if balance > 0:
                reply = f"Payment of ₹{extracted.payment_amount} updated for {job.customer_name} (Job: {job.job_id}). Outstanding balance: ₹{balance}."
            else:
                reply = f"Payment of ₹{extracted.payment_amount} updated for {job.customer_name} (Job: {job.job_id}). The balance is fully settled!"
                
            return ChatResponse(reply=reply, action="refresh_jobs")
            
        else: 
            reply = extracted.casual_response or "I am VANIGAN, your shop assistant. How can I help?"
            return ChatResponse(reply=reply)
            
    except Exception as e:
        # Catch any unexpected error and send it nicely to the UI chat bubble
        import traceback
        print("=== INTERNAL SERVER ERROR ===")
        traceback.print_exc()
        print("=============================")
        error_str = str(e)
        if "503" in error_str or "UNAVAILABLE" in error_str:
            return ChatResponse(reply="System is a bit busy right now! Please give me one moment and send your request again.")
        return ChatResponse(reply=f"Internal Server Error: {error_str}")

@app.get("/api/jobs")
def get_jobs(user_id: Optional[int] = None, db: Session = Depends(database.get_db)):
    try:
        query = db.query(models.Job)
        if user_id is not None:
            if user_id == 1:
                query = query.filter((models.Job.user_id == user_id) | (models.Job.user_id == None))
            else:
                query = query.filter(models.Job.user_id == user_id)
        else:
            query = query.filter(models.Job.user_id == None)
        jobs = query.all()
        
        # Dynamic Countdown Calculation Engine
        from datetime import datetime
        # Force baseline per requirement
        current_date = datetime(2026, 6, 25)
        
        response_jobs = []
        for job in jobs:
            job_dict = {
                "id": job.id,
                "user_id": job.user_id,
                "job_id": job.job_id,
                "customer_name": job.customer_name,
                "phone": job.phone,
                "product": job.product,
                "issue": job.issue,
                "total_cost": job.total_cost,
                "advance_paid": job.advance_paid,
                "status": job.status,
                "deadline": job.deadline,
                "raw_deadline": job.deadline
            }
            if job.deadline:
                try:
                    target_date = datetime.strptime(job.deadline, "%Y-%m-%d")
                    diff_days = (target_date - current_date).days
                    if diff_days == 0:
                        job_dict["deadline"] = "Due Today"
                    elif diff_days == 1:
                        job_dict["deadline"] = "Due Tomorrow"
                    elif diff_days > 1:
                        job_dict["deadline"] = f"Due in {diff_days} Days"
                    elif diff_days < 0:
                        job_dict["deadline"] = f"Overdue: {abs(diff_days)} Days"
                except Exception:
                    pass
            response_jobs.append(job_dict)
            
        return response_jobs
    except Exception as e:
        # If schema is outdated, drop and recreate tables automatically
        models.Base.metadata.drop_all(bind=database.engine)
        models.Base.metadata.create_all(bind=database.engine)
        return []

@app.put("/api/jobs/{job_id}")
def update_job_status(job_id: str, payload: dict, db: Session = Depends(database.get_db)):
    job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if job:
        if "status" in payload:
            job.status = payload["status"]
        if "customer_name" in payload:
            job.customer_name = payload["customer_name"]
        if "phone" in payload:
            job.phone = payload["phone"]
        if "product" in payload:
            job.product = payload["product"]
        if "total_cost" in payload:
            job.total_cost = float(payload["total_cost"] or 0)
        if "advance_paid" in payload:
            job.advance_paid = float(payload["advance_paid"] or 0)
            
        # Optional: Re-evaluate status if it was Pending Quote
        if job.status == "Pending Quote" and job.total_cost > 0:
            job.status = "Pending"

        db.commit()
        return {"success": True}
    return {"success": False}

@app.get("/api/analytics")
def get_analytics(user_id: Optional[int] = None, db: Session = Depends(database.get_db)):
    try:
        query = db.query(models.Job)
        if user_id is not None:
            if user_id == 1:
                query = query.filter((models.Job.user_id == user_id) | (models.Job.user_id == None))
            else:
                query = query.filter(models.Job.user_id == user_id)
        else:
            query = query.filter(models.Job.user_id == None)
        jobs = query.all()
    except Exception:
        models.Base.metadata.drop_all(bind=database.engine)
        models.Base.metadata.create_all(bind=database.engine)
        jobs = []
    today = datetime.now().date()
    turnover = {"today": 0, "weekly": 0, "monthly": 0, "yearly": 0}
    
    for job in jobs:
        try:
            date_str = job.job_id[2:8] # Extract YYMMDD from VNYYMMDD-XXX
            job_date = datetime.strptime(date_str, "%y%m%d").date()
        except:
            continue
            
        try:
            amt = float(job.advance_paid or 0)
        except:
            amt = 0
            
        days_diff = (today - job_date).days
        if days_diff == 0:
            turnover["today"] += amt
        if 0 <= days_diff <= 7:
            turnover["weekly"] += amt
        if 0 <= days_diff <= 30:
            turnover["monthly"] += amt
        if 0 <= days_diff <= 365:
            turnover["yearly"] += amt
            
    return turnover

@app.get("/api/auth/github")
def github_login():
    client_id = os.getenv("GITHUB_CLIENT_ID")
    redirect_uri = os.getenv("GITHUB_REDIRECT_URI")
    
    if not client_id or not redirect_uri:
        return {"error": "GitHub OAuth is not configured on the server."}
        
    auth_url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={client_id}"
        f"&redirect_uri={urllib.parse.quote(redirect_uri)}"
        "&scope=user:email"
    )
    return RedirectResponse(url=auth_url)

@app.get("/api/auth/callback")
def github_callback(code: str, db: Session = Depends(database.get_db)):
    client_id = os.getenv("GITHUB_CLIENT_ID")
    client_secret = os.getenv("GITHUB_CLIENT_SECRET")
    redirect_uri = os.getenv("GITHUB_REDIRECT_URI")
    
    if not client_id or not client_secret or not redirect_uri:
        return {"error": "GitHub OAuth is not configured on the server."}
        
    token_url = "https://github.com/login/oauth/access_token"
    token_data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": redirect_uri
    }
    
    try:
        req = urllib.request.Request(token_url, data=urllib.parse.urlencode(token_data).encode('utf-8'))
        req.add_header("Accept", "application/json")
        with urllib.request.urlopen(req) as response:
            token_res = json.loads(response.read())
            
        access_token = token_res.get("access_token")
        if not access_token:
            return {"error": "Failed to get access token from GitHub"}
        
        userinfo_url = "https://api.github.com/user"
        req = urllib.request.Request(userinfo_url)
        req.add_header("Authorization", f"Bearer {access_token}")
        with urllib.request.urlopen(req) as response:
            user_info = json.loads(response.read())
            
        email = user_info.get("email")
        
        if not email:
            emails_url = "https://api.github.com/user/emails"
            req2 = urllib.request.Request(emails_url)
            req2.add_header("Authorization", f"Bearer {access_token}")
            with urllib.request.urlopen(req2) as resp2:
                emails_info = json.loads(resp2.read())
                for e in emails_info:
                    if e.get("primary"):
                        email = e.get("email")
                        break
                        
        if not email:
            return {"error": "Failed to get email from GitHub"}
            
        # Check if user exists
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            name = user_info.get("name")
            if not name:
                name = user_info.get("login", "Shop User")
            user = models.User(
                email=email,
                password="github_oauth_no_password",
                shop_name=f"{name}'s Shop",
                business_type="General Repair"
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            
        payload = {
            "success": True,
            "user_id": user.id,
            "shop_name": user.shop_name,
            "business_type": user.business_type
        }
        
        encoded_payload = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8")
        # Redirect to frontend
        return RedirectResponse(url=f"https://vanigan1.netlify.app/?auth_payload={encoded_payload}")
        
    except Exception as e:
        print(f"OAuth Error: {e}")
        return {"error": "Failed to authenticate with GitHub"}

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
