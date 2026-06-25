from sqlalchemy import Column, Integer, String, Float, ForeignKey
from backend.database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password = Column(String)
    shop_name = Column(String)
    business_type = Column(String)

class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    job_id = Column(String, unique=True, index=True)
    customer_name = Column(String, index=True)
    phone = Column(String, index=True)
    product = Column(String)
    issue = Column(String)
    deadline = Column(String)
    total_cost = Column(Float, default=0.0)
    advance_paid = Column(Float, default=0.0)
    status = Column(String, default="Pending")
