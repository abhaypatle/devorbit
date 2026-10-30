from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from app.db.session import get_db
from app.models.inquiry import ClientProjectInquiry

router = APIRouter()

FEATURE_PRICING = {
    "KYC_VERIFICATION": 8000.0,
    "UPI_PAYMENT": 4500.0,
    "ADMIN_DESK": 7000.0,
    "MULTI_LANG": 3500.0,
    "WHATSAPP_BOT": 5000.0,
    "INVENTORY_MGMT": 6000.0
}

BASE_CATEGORY_COST = {
    "LENDING": 25000.0,
    "RETAIL": 18000.0,
    "HEALTHCARE": 22000.0,
    "CUSTOM": 15000.0
}

class InquiryCreate(BaseModel):
    client_name: str
    business_name: Optional[str] = None
    phone: str
    email: Optional[EmailStr] = None
    business_category: str
    selected_features: List[str]
    client_signature_data: Optional[str] = None

@router.post("/get-started/submit", status_code=status.HTTP_201_CREATED)
async def submit_inquiry(payload: InquiryCreate, db: AsyncSession = Depends(get_db)):
    base_cost = BASE_CATEGORY_COST.get(payload.business_category, 15000.0)
    features_cost = sum(FEATURE_PRICING.get(f, 0.0) for f in payload.selected_features)
    total_budget = base_cost + features_cost
    proposal_url = f"/static/proposals/sow_{payload.phone[-4:]}.pdf"

    new_inquiry = ClientProjectInquiry(
        client_name=payload.client_name,
        business_name=payload.business_name,
        phone=payload.phone,
        email=payload.email,
        business_category=payload.business_category,
        selected_features=payload.selected_features,
        estimated_budget=total_budget,
        proposal_pdf_url=proposal_url,
        client_signature_data=payload.client_signature_data,
        status="PROPOSAL_GENERATED"
    )
    db.add(new_inquiry)
    await db.commit()
    await db.refresh(new_inquiry)

    return {
        "inquiry_id": str(new_inquiry.id),
        "estimated_budget": total_budget,
        "proposal_pdf_url": proposal_url,
        "token_required": 5000.0,
        "status": new_inquiry.status
    }
