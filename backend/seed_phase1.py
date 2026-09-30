import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.ticket_activity import SlaPolicy
from app.models.ticket import Ticket

def seed():
    db = SessionLocal()
    try:
        if db.query(SlaPolicy).count() == 0:
            policies = [
                SlaPolicy(channel=None, priority='HIGH', response_minutes=240, business_hours=False, active=True),
                SlaPolicy(channel=None, priority='MEDIUM', response_minutes=1440, business_hours=False, active=True),
                SlaPolicy(channel=None, priority='LOW', response_minutes=2880, business_hours=False, active=True),
            ]
            db.add_all(policies)
            db.commit()
            print("SLA policies seeded.")
        else:
            print("SLA policies already exist.")

        tickets = db.query(Ticket).all()
        for t in tickets:
            updated = False
            if not t.awaiting:
                t.awaiting = 'STAFF'
                updated = True
            if not t.fy:
                t.fy = '2026-27'
                updated = True
            if not t.no and t.id:
                try:
                    num_id = int(''.join(filter(str.isdigit, t.id)) or '0')
                    t.no = f"QRY-{num_id:06d}"
                except:
                    t.no = f"QRY-{t.id}"
                updated = True
            if updated:
                db.add(t)
        db.commit()
        print(f"Backfilled {len(tickets)} tickets.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == '__main__':
    seed()
