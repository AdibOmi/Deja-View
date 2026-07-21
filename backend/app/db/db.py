from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
#sqlalchemy lets python use classes instead of SQL tables
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    # Some hosts (e.g. Render) hand out the legacy "postgres://" scheme,
    # which SQLAlchemy 2.x no longer accepts.
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)
#creates connection to Postgre
SessionLocal = sessionmaker(autocommit=False, autoflush = False, bind = engine)
Base = declarative_base()
#parent class for all tables
