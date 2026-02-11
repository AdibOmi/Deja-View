from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
#sqlalchemy lets python use classes instead of SQL tables
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)
#creates connection to Postgre
SessionLocal = sessionmaker(autocommit=False, autoflush = False, bind = engine)
Base = declarative_base()
#parent class for all tables
