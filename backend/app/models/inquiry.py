from sqlalchemy import Column, String, Numeric, Text, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
from app.db.base_class import Base

class ClientProjectInquiry(Base):
    __tablename__ = "client_project_inquiries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    client_name = Column(String(100), nullable=False)
    business_name = Column(String(150), nullable=True)
    phone = Column(String(20), nullable=False)
    email = Column(String(100), nullable=True)
    business_category = Column(String(50), nullable=False)
    selected_features = Column(JSONB, nullable=False, default=[])
    estimated_budget = Column(Numeric(12, 2), nullable=False, default=0.0)
    status = Column(String(30), default="PROPOSAL_GENERATED", index=True)
    proposal_pdf_url = Column(Text, nullable=True)
    client_signature_data = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
