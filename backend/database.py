"""Database connection module for Fleet Management System"""
import os
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "fleet_management")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
