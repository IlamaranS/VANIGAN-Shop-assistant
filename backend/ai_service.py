import os
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv("backend/.env")

class JobExtraction(BaseModel):
    intent: str = Field(description="The user's intent. Must be one of: 'create_job', 'update_job', 'search', 'get_analytics', 'casual_chat', 'process_payment', 'cancel'")
    customer_name: str = Field(default="", description="Name of the customer")
    job_id: str = Field(default="", description="Specific JOB ID if provided (e.g. VN260619-003)")
    phone: str = Field(default="", description="Phone number of the customer")
    product: str = Field(default="", description="The product being repaired")
    issue: str = Field(default="", description="The issue or problem described")
    deadline: str = Field(default="", description="The deadline for the repair")
    total_cost: float = Field(default=0.0, description="The total cost of the repair")
    advance_paid: float = Field(default=0.0, description="Amount of advance paid, if any")
    search_query: str = Field(default="", description="The search term if intent is 'search'")
    casual_response: str = Field(default="", description="A polite response if the intent is 'casual_chat'")
    payment_amount: float = Field(default=0.0, description="The amount being paid, if intent is 'process_payment'")

def get_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    return genai.Client(api_key=api_key)

def process_chat_message(message: str, recent_jobs_context: str = "") -> JobExtraction:
    client = get_client()
    if not client:
        return JobExtraction(intent="casual_chat", casual_response="API key not configured.")
        
    msg_lower = message.lower().strip()
    force_create = False
    for keyword in ["new customer", "add customer", "create entries"]:
        if msg_lower.startswith(keyword) or keyword in msg_lower:
            force_create = True
            break
        
    system_instruction = (
        "You are VANIGAN, a strict shop database manager and repair assistant. "
        "Your tone should be helpful and precise. "
        "Extract details from the user's message to manage repair jobs. "
        "If the user is just saying hello, asking a general question, or chatting casually, use 'casual_chat' and provide a warm 'casual_response'. "
        "Use 'create_job' if the user explicitly wants to log a new order, report a repair, or provide details for one (e.g. they say 'new customer', 'add', 'create', 'setup'). "
        "CRITICAL CONVERSATIONAL ROUTING RULE: If the user message contains information about a customer name, device, phone number, product, or issue, you MUST immediately call the JobExtraction tool to parse the fields. Do not engage in casual conversation or ask the user to re-enter details if at least one core extraction field is present. Prioritize extraction over textual conversational responses. "
        "Use 'update_job' if the user wants to update details (like total cost, deadline, phone) of an EXISTING customer or job. "
        "Intents: 'create_job' for new repairs, 'update_job' for modifying existing repairs, 'search' for looking up jobs, 'casual_chat' for general talk, 'process_payment' for payments, 'cancel' to stop or abort. "
        "MANDATORY VERIFICATION: Before allowing a new ticket to save, you must explicitly demand and collect four mandatory pieces of data: [Customer Name, Phone Number, Product/Issue, and Total Cost]. "
        "If Total Cost is not specified, you must actively loop back and ask: 'What is the total estimated cost for this repair?' instead of defaulting to 0. "
        "CRITICAL: If a value is not explicitly provided in the message, you MUST return an empty string '' or 0. Do not use 'none', 'unknown', 'N/A', or null.\n"
        "You have access to the active shop logs below. Use this data to answer any summarizing questions from the shop keeper about past jobs, balances, or status updates naturally in your 'casual_response'.\n"
        f"RECENT JOBS CONTEXT:\n{recent_jobs_context}"
    )
    
    # We pass the message and also instruct it to parse it into the schema
    try:
        user_content = types.Content(role="user", parts=[types.Part.from_text(text=message)])
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[user_content],
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=JobExtraction,
                temperature=0.0
            )
        )
        
        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.endswith("```"):
            text = text[:-3]
            
        extraction = JobExtraction.model_validate_json(text.strip())
        if force_create:
            extraction.intent = "create_job"
        return extraction
    except Exception as e:
        import traceback
        print("=== GEMINI API ERROR ===")
        traceback.print_exc()
        print("========================")
        error_msg = str(e)
        if "503" in error_msg or "UNAVAILABLE" in error_msg:
            return JobExtraction(intent="casual_chat", casual_response="System is a bit busy right now! Please give me one moment and send your request again.")
        return JobExtraction(intent="casual_chat", casual_response=f"AI parsing error: {error_msg}")
