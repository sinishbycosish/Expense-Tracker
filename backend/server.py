from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List
import uuid
from datetime import datetime, timezone
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.units import inch
import io
from fastapi.responses import StreamingResponse
from collections import defaultdict


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    category: str
    description: str
    amount: float
    type: str  # "income" or "expense"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TransactionCreate(BaseModel):
    date: str
    category: str
    description: str
    amount: float
    type: str

class Summary(BaseModel):
    total_income: float
    total_expense: float
    net_balance: float
    transaction_count: int

class CategoryBreakdown(BaseModel):
    category: str
    amount: float
    percentage: float

class Analytics(BaseModel):
    expense_by_category: List[CategoryBreakdown]
    income_by_category: List[CategoryBreakdown]


# Routes
@api_router.get("/")
async def root():
    return {"message": "Expense Tracker API"}


@api_router.post("/transactions", response_model=Transaction)
async def create_transaction(input: TransactionCreate):
    transaction_dict = input.model_dump()
    transaction_obj = Transaction(**transaction_dict)
    
    doc = transaction_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    _ = await db.transactions.insert_one(doc)
    return transaction_obj


@api_router.get("/transactions", response_model=List[Transaction])
async def get_transactions():
    transactions = await db.transactions.find({}, {"_id": 0}).to_list(1000)
    
    for transaction in transactions:
        if isinstance(transaction['created_at'], str):
            transaction['created_at'] = datetime.fromisoformat(transaction['created_at'])
    
    # Sort by date descending
    transactions.sort(key=lambda x: x['date'], reverse=True)
    return transactions


@api_router.delete("/transactions/{transaction_id}")
async def delete_transaction(transaction_id: str):
    result = await db.transactions.delete_one({"id": transaction_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"message": "Transaction deleted successfully"}


@api_router.get("/summary", response_model=Summary)
async def get_summary():
    transactions = await db.transactions.find({}, {"_id": 0}).to_list(1000)
    
    total_income = sum(t['amount'] for t in transactions if t['type'] == 'income')
    total_expense = sum(t['amount'] for t in transactions if t['type'] == 'expense')
    
    return Summary(
        total_income=total_income,
        total_expense=total_expense,
        net_balance=total_income - total_expense,
        transaction_count=len(transactions)
    )


@api_router.get("/analytics", response_model=Analytics)
async def get_analytics():
    transactions = await db.transactions.find({}, {"_id": 0}).to_list(1000)
    
    # Calculate category breakdowns
    expense_by_cat = defaultdict(float)
    income_by_cat = defaultdict(float)
    
    for t in transactions:
        if t['type'] == 'expense':
            expense_by_cat[t['category']] += t['amount']
        else:
            income_by_cat[t['category']] += t['amount']
    
    # Calculate totals
    total_expense = sum(expense_by_cat.values())
    total_income = sum(income_by_cat.values())
    
    # Create breakdown with percentages
    expense_breakdown = [
        CategoryBreakdown(
            category=cat,
            amount=amt,
            percentage=round((amt / total_expense * 100), 2) if total_expense > 0 else 0
        )
        for cat, amt in expense_by_cat.items()
    ]
    
    income_breakdown = [
        CategoryBreakdown(
            category=cat,
            amount=amt,
            percentage=round((amt / total_income * 100), 2) if total_income > 0 else 0
        )
        for cat, amt in income_by_cat.items()
    ]
    
    return Analytics(
        expense_by_category=expense_breakdown,
        income_by_category=income_breakdown
    )


@api_router.post("/reports/pdf")
async def generate_pdf_report():
    # Fetch data
    transactions = await db.transactions.find({}, {"_id": 0}).to_list(1000)
    summary_data = await get_summary()
    analytics_data = await get_analytics()
    
    # Create PDF in memory
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    title = Paragraph("<b>Expense Tracker Report</b>", styles['Title'])
    elements.append(title)
    elements.append(Spacer(1, 0.3*inch))
    
    # Summary section
    summary_title = Paragraph("<b>Financial Summary</b>", styles['Heading2'])
    elements.append(summary_title)
    elements.append(Spacer(1, 0.1*inch))
    
    summary_data_table = [
        ['Total Income', f'${summary_data.total_income:.2f}'],
        ['Total Expenses', f'${summary_data.total_expense:.2f}'],
        ['Net Balance', f'${summary_data.net_balance:.2f}'],
        ['Total Transactions', str(summary_data.transaction_count)]
    ]
    
    summary_table = Table(summary_data_table, colWidths=[3*inch, 2*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.lightblue),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 0.3*inch))
    
    # Top Expense Categories
    if analytics_data.expense_by_category:
        expense_title = Paragraph("<b>Top Expense Categories</b>", styles['Heading2'])
        elements.append(expense_title)
        elements.append(Spacer(1, 0.1*inch))
        
        expense_data = [['Category', 'Amount', 'Percentage']]
        sorted_expenses = sorted(analytics_data.expense_by_category, key=lambda x: x.amount, reverse=True)[:5]
        for cat in sorted_expenses:
            expense_data.append([cat.category, f'${cat.amount:.2f}', f'{cat.percentage}%'])
        
        expense_table = Table(expense_data, colWidths=[2*inch, 1.5*inch, 1.5*inch])
        expense_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(expense_table)
        elements.append(Spacer(1, 0.3*inch))
    
    # Recent Transactions
    transactions_title = Paragraph("<b>Recent Transactions</b>", styles['Heading2'])
    elements.append(transactions_title)
    elements.append(Spacer(1, 0.1*inch))
    
    trans_data = [['Date', 'Category', 'Description', 'Amount', 'Type']]
    recent_transactions = sorted(transactions, key=lambda x: x['date'], reverse=True)[:10]
    for t in recent_transactions:
        trans_data.append([
            t['date'],
            t['category'],
            t['description'][:20],
            f'${t["amount"]:.2f}',
            t['type'].capitalize()
        ])
    
    trans_table = Table(trans_data, colWidths=[1.2*inch, 1.2*inch, 1.8*inch, 1*inch, 1*inch])
    trans_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 8)
    ]))
    elements.append(trans_table)
    
    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=expense_report_{datetime.now().strftime('%Y%m%d')}.pdf"}
    )

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()