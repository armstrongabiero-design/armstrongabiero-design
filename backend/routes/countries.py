"""Country routes"""
from fastapi import APIRouter
from typing import List
from datetime import datetime

from database import db
from models import Country, CountryCreate

router = APIRouter()


@router.post("/countries", response_model=Country)
async def create_country(input: CountryCreate):
    country = Country(**input.model_dump())
    doc = country.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.countries.insert_one(doc)
    return country


@router.get("/countries", response_model=List[Country])
async def get_countries():
    countries = await db.countries.find({}, {"_id": 0}).to_list(100)
    for c in countries:
        if isinstance(c.get('created_at'), str):
            c['created_at'] = datetime.fromisoformat(c['created_at'])
    return countries


@router.get("/countries/all-list")
async def get_all_countries_list():
    """Get list of all countries for registration - static list"""
    countries = [
        {"code": "AF", "name": "Afghanistan"},
        {"code": "AL", "name": "Albania"},
        {"code": "DZ", "name": "Algeria"},
        {"code": "AO", "name": "Angola"},
        {"code": "AR", "name": "Argentina"},
        {"code": "AU", "name": "Australia"},
        {"code": "AT", "name": "Austria"},
        {"code": "BD", "name": "Bangladesh"},
        {"code": "BE", "name": "Belgium"},
        {"code": "BJ", "name": "Benin"},
        {"code": "BW", "name": "Botswana"},
        {"code": "BR", "name": "Brazil"},
        {"code": "BF", "name": "Burkina Faso"},
        {"code": "BI", "name": "Burundi"},
        {"code": "CM", "name": "Cameroon"},
        {"code": "CA", "name": "Canada"},
        {"code": "CV", "name": "Cape Verde"},
        {"code": "CF", "name": "Central African Republic"},
        {"code": "TD", "name": "Chad"},
        {"code": "CN", "name": "China"},
        {"code": "CO", "name": "Colombia"},
        {"code": "KM", "name": "Comoros"},
        {"code": "CG", "name": "Congo"},
        {"code": "CD", "name": "Congo (DRC)"},
        {"code": "CI", "name": "Côte d'Ivoire"},
        {"code": "HR", "name": "Croatia"},
        {"code": "CZ", "name": "Czech Republic"},
        {"code": "DK", "name": "Denmark"},
        {"code": "DJ", "name": "Djibouti"},
        {"code": "EG", "name": "Egypt"},
        {"code": "GQ", "name": "Equatorial Guinea"},
        {"code": "ER", "name": "Eritrea"},
        {"code": "ET", "name": "Ethiopia"},
        {"code": "FI", "name": "Finland"},
        {"code": "FR", "name": "France"},
        {"code": "GA", "name": "Gabon"},
        {"code": "GM", "name": "Gambia"},
        {"code": "DE", "name": "Germany"},
        {"code": "GH", "name": "Ghana"},
        {"code": "GR", "name": "Greece"},
        {"code": "GN", "name": "Guinea"},
        {"code": "GW", "name": "Guinea-Bissau"},
        {"code": "HU", "name": "Hungary"},
        {"code": "IN", "name": "India"},
        {"code": "ID", "name": "Indonesia"},
        {"code": "IE", "name": "Ireland"},
        {"code": "IL", "name": "Israel"},
        {"code": "IT", "name": "Italy"},
        {"code": "JP", "name": "Japan"},
        {"code": "KE", "name": "Kenya"},
        {"code": "KR", "name": "South Korea"},
        {"code": "LR", "name": "Liberia"},
        {"code": "LY", "name": "Libya"},
        {"code": "MG", "name": "Madagascar"},
        {"code": "MW", "name": "Malawi"},
        {"code": "MY", "name": "Malaysia"},
        {"code": "ML", "name": "Mali"},
        {"code": "MR", "name": "Mauritania"},
        {"code": "MU", "name": "Mauritius"},
        {"code": "MX", "name": "Mexico"},
        {"code": "MA", "name": "Morocco"},
        {"code": "MZ", "name": "Mozambique"},
        {"code": "NA", "name": "Namibia"},
        {"code": "NL", "name": "Netherlands"},
        {"code": "NZ", "name": "New Zealand"},
        {"code": "NE", "name": "Niger"},
        {"code": "NG", "name": "Nigeria"},
        {"code": "NO", "name": "Norway"},
        {"code": "PK", "name": "Pakistan"},
        {"code": "PH", "name": "Philippines"},
        {"code": "PL", "name": "Poland"},
        {"code": "PT", "name": "Portugal"},
        {"code": "RO", "name": "Romania"},
        {"code": "RU", "name": "Russia"},
        {"code": "RW", "name": "Rwanda"},
        {"code": "ST", "name": "São Tomé and Príncipe"},
        {"code": "SA", "name": "Saudi Arabia"},
        {"code": "SN", "name": "Senegal"},
        {"code": "SC", "name": "Seychelles"},
        {"code": "SL", "name": "Sierra Leone"},
        {"code": "SG", "name": "Singapore"},
        {"code": "ZA", "name": "South Africa"},
        {"code": "SS", "name": "South Sudan"},
        {"code": "ES", "name": "Spain"},
        {"code": "SD", "name": "Sudan"},
        {"code": "SZ", "name": "Eswatini"},
        {"code": "SE", "name": "Sweden"},
        {"code": "CH", "name": "Switzerland"},
        {"code": "TZ", "name": "Tanzania"},
        {"code": "TH", "name": "Thailand"},
        {"code": "TG", "name": "Togo"},
        {"code": "TN", "name": "Tunisia"},
        {"code": "TR", "name": "Turkey"},
        {"code": "UG", "name": "Uganda"},
        {"code": "UA", "name": "Ukraine"},
        {"code": "AE", "name": "United Arab Emirates"},
        {"code": "GB", "name": "United Kingdom"},
        {"code": "US", "name": "United States"},
        {"code": "ZM", "name": "Zambia"},
        {"code": "ZW", "name": "Zimbabwe"}
    ]
    return {"countries": countries}


@router.get("/countries/{country_name}", response_model=Country)
async def get_country(country_name: str):
    country = await db.countries.find_one({"name": country_name}, {"_id": 0})
    if not country:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Country not found")
    if isinstance(country.get('created_at'), str):
        country['created_at'] = datetime.fromisoformat(country['created_at'])
    return country
