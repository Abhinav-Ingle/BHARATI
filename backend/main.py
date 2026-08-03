import cv2
import uvicorn
import time
import threading
import json
import os
import math
import numpy as np
import base64
from fastapi import FastAPI, Response, Request, HTTPException, Depends
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from pydantic import BaseModel
from typing import List

# ==========================================
# CLOUD COMPATIBILITY FIX: TKINTER (GUI)
# ==========================================
try:
    import tkinter as tk
    from tkinter import filedialog
except ImportError:
    tk = None
    filedialog = None

# --- MONGODB & WHATSAPP IMPORTS ---
from pymongo import MongoClient
from bson import ObjectId
try:
    from twilio.rest import Client
except ImportError:
    print("⚠️ Twilio library not found. Run 'pip install twilio'")

# ==========================================
# CLOUD COMPATIBILITY FIX: WINSOUND (AUDIO)
# ==========================================
try:
    import winsound
except ImportError:
    class WinsoundMock:
        @staticmethod
        def Beep(frequency, duration):
            pass 
        @staticmethod
        def PlaySound(sound, flags):
            pass
    winsound = WinsoundMock()

app = FastAPI(title="BHARATI Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# 🔑 DATABASES & API CONFIGURATIONS
# ==============================================================================
MONGO_URI = "mongodb+srv://bharati_admin:Cantfakeall@cluster0.pxsvmko.mongodb.net/?appName=Cluster0"

db_client = MongoClient(MONGO_URI)
db = db_client["bharati_rescue_db"]       

TWILIO_ACCOUNT_SID = "AC6d62fb0b9fa9b2c74d3de075e6204d94" 
TWILIO_AUTH_TOKEN = "2fd3cd86e4e848002311a098af03a5f3"
TWILIO_WHATSAPP_SENDER = "whatsapp:+14155238886" 

# --- CONFIGURATION ---
CAM_CONFIG = [
    {"id": "CAM-01", "url": "browser", "loc": "Main Beach"}, 
    {"id": "CAM-02", "url": "offline", "loc": "Tower 4"}, 
    {"id": "CAM-03", "url": "offline", "loc": "Shallow Bay"},
]

FIXED_RIP_BOX = [10, 50, 50, 100] 

# Initialize YOLO globally
try:
    model = YOLO("best.pt") if os.path.exists("best.pt") else YOLO("yolov8n.pt")
except:
    model = YOLO("yolov8n.pt")

def seed_admin_account():
    try:
        admin_collection = db["admins"]
        existing_admin = admin_collection.find_one({"username": "admin"})
        if not existing_admin:
            master_admin = {
                "name": "Headquarters Admin",
                "username": "admin",
                "password": "admin", 
                "role": "admin"
            }
            admin_collection.insert_one(master_admin)
    except Exception as e:
        pass

seed_admin_account()

# --- DATA MODELS ---
class LoginRequest(BaseModel):
    username: str
    password: str

class SettingsModel(BaseModel):
    danger_threshold: float
    min_person_pixels: int
    record_duration: int
    save_directory: str
    enable_log: bool
    enable_sms: bool
    enable_siren: bool
    sms_phone_number: str

class LifeguardModel(BaseModel):
    name: str
    mobile: str
    username: str
    password: str
    created_by: str 

class FrameRequest(BaseModel):
    cam_id: str
    image: str

# --- SETTINGS CONFIG FILE ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SETTINGS_FILE = os.path.join(BASE_DIR, "settings.json")

DEFAULT_SETTINGS = {
    "danger_threshold": 85.0,      
    "min_person_pixels": 67,      
    "record_duration": 8,        
    "save_directory": os.path.join(BASE_DIR, "recordings"),
    "enable_log": True,
    "enable_sms": True,
    "enable_siren": True,
    "sms_phone_number": "8010057119"
}

current_settings = DEFAULT_SETTINGS.copy()
if os.path.exists(SETTINGS_FILE):
    try:
        with open(SETTINGS_FILE, "r") as f: current_settings.update(json.load(f))
    except: pass

last_alert_times = {} 
camera_data = {cam["id"]: {"frame": None, "status": "offline", "threat": False, "people_count": 0, "danger_count": 0} for cam in CAM_CONFIG}

# --- HELPER FUNCTIONS ---
def get_center(box): return (int((box[0] + box[2]) / 2), int((box[1] + box[3]) / 2))
def calculate_distance(p1, p2): return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

def send_whatsapp_alert(camera_id, location, phone_numbers_string):
    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        message_body = (f"🚨 *BHARATI RESCUE ALERT* 🚨\n\n"
                        f"⚠️ *Life Threat Detected!*\n"
                        f"📍 Location: {location}\n"
                        f"📹 Camera: {camera_id}\n\n"
                        f"Please check the dashboard immediately.")
        
        raw_numbers = [n.strip() for n in phone_numbers_string.split(',') if n.strip()]
        for num in raw_numbers:
            formatted_num = num if num.startswith('+') else f"+91{num}"
            if len(formatted_num) >= 10:
                client.messages.create(body=message_body, from_=TWILIO_WHATSAPP_SENDER, to=f"whatsapp:{formatted_num}")
    except Exception as e: 
        print(f"❌ WhatsApp Delivery Failed: {e}")


# ==============================================================================
# 🛰️ REAL-TIME BROWSER CAMERA PROCESSOR
# ==============================================================================
@app.post("/process_frame")
def process_frame(req: FrameRequest):
    cam_id = req.cam_id
    image_data = req.image

    # Mark camera online
    camera_data[cam_id]["status"] = "online"

    # Decode base64 to OpenCV format
    try:
        encoded_data = image_data.split(',')[1]
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except:
        return {"error": "Invalid Image Data"}

    # YOLO Inference
    results = model(frame, verbose=False, conf=0.4)
    annotated_frame = frame.copy()
    people = []
    
    cv2.rectangle(annotated_frame, (FIXED_RIP_BOX[0], FIXED_RIP_BOX[1]), (FIXED_RIP_BOX[2], FIXED_RIP_BOX[3]), (255, 0, 0), 2)
    rip_center = get_center(FIXED_RIP_BOX)

    for box in results[0].boxes:
        if int(box.cls[0]) == 0: # 0 is 'person'
            coords = box.xyxy[0].cpu().numpy().astype(int)
            people.append(coords)
            cv2.rectangle(annotated_frame, (coords[0], coords[1]), (coords[2], coords[3]), (0, 255, 0), 2)

    threat_detected = False
    current_danger_count = 0
    min_safe_dist = float(current_settings["danger_threshold"])

    for person_box in people:
        person_center = get_center(person_box)
        dist = calculate_distance(person_center, rip_center)
        if dist < min_safe_dist:
            threat_detected = True
            current_danger_count += 1
            cv2.putText(annotated_frame, "DANGER!", (person_center[0], person_center[1]-20), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        cv2.line(annotated_frame, person_center, rip_center, (0, 255, 0) if dist >= min_safe_dist else (0, 0, 255), 2)

    camera_data[cam_id]["threat"] = threat_detected
    camera_data[cam_id]["people_count"] = len(people)
    camera_data[cam_id]["danger_count"] = current_danger_count

    # Handle Alerts
    now = time.time()
    if threat_detected and current_settings["enable_sms"] and (now - last_alert_times.get(cam_id, 0)) > 60.0:
        last_alert_times[cam_id] = now
        loc = next((c["loc"] for c in CAM_CONFIG if c["id"] == cam_id), "Unknown")
        threading.Thread(target=send_whatsapp_alert, args=(cam_id, loc, current_settings.get("sms_phone_number", ""))).start()

    # Encode back to Base64
    _, buffer = cv2.imencode('.jpg', annotated_frame)
    b64_img = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')
    
    return {
        "cam_id": cam_id,
        "threat": threat_detected,
        "people_count": len(people),
        "danger_count": current_danger_count,
        "processed_image": b64_img
    }

# ==============================================================================
# 🛰️ DATABASE ROUTED FASTAPI ENDPOINTS
# ==============================================================================
@app.post("/login")
def login(req: LoginRequest):
    admin = db["admins"].find_one({"username": req.username, "password": req.password})
    if admin: return {"status": "success", "username": admin["username"], "role": "admin"}
    guard = db["lifeguards"].find_one({"username": req.username, "password": req.password})
    if guard: return {"status": "success", "username": guard["username"], "role": "lifeguard"}
    raise HTTPException(status_code=401, detail="Invalid Credentials")

@app.get("/status")
def get_status():
    overall_threat = "SAFE"
    threat_source = None
    cam_list = []
    for cid, data in camera_data.items():
        if data["threat"]: overall_threat = "DANGER"; threat_source = cid
        cam_list.append({
            "id": cid, "status": data["status"], "has_threat": data["threat"],
            "people_count": data["people_count"], "danger_count": data["danger_count"]
        })
    return {"threat_level": overall_threat, "threat_source": threat_source, "cameras": cam_list}

@app.get("/settings")
def get_settings(): return current_settings

@app.post("/settings")
def update_settings(new_settings: SettingsModel):
    global current_settings
    current_settings = new_settings.dict()
    try:
        with open(SETTINGS_FILE, "w") as f: json.dump(current_settings, f, indent=4)
    except: pass
    return {"status": "updated", "settings": current_settings}

@app.get("/lifeguards")
def get_lifeguards(admin_id: str):
    return list(db["lifeguards"].find({"created_by": admin_id}, {"_id": 0}))

@app.post("/lifeguards")
def add_lifeguard(guard: LifeguardModel):
    guard.username = guard.username.strip()
    if db["lifeguards"].find_one({"username": guard.username}):
        raise HTTPException(status_code=400, detail="Username exists")
    db["lifeguards"].insert_one(guard.dict())
    return {"status": "added", "lifeguards": list(db["lifeguards"].find({"created_by": guard.created_by}, {"_id": 0}))}

@app.put("/lifeguards/{original_username}")
def update_lifeguard(original_username: str, updated_guard: LifeguardModel):
    updated_guard.username = updated_guard.username.strip()
    if not db["lifeguards"].find_one({"username": original_username.strip(), "created_by": updated_guard.created_by}): 
        raise HTTPException(status_code=404)
    db["lifeguards"].update_one({"username": original_username.strip()}, {"$set": updated_guard.dict()})
    return {"status": "updated", "lifeguards": list(db["lifeguards"].find({"created_by": updated_guard.created_by}, {"_id": 0}))}

@app.delete("/lifeguards/{username}")
def delete_lifeguard(username: str, admin_id: str):
    if not db["lifeguards"].find_one({"username": username.strip(), "created_by": admin_id}):
        raise HTTPException(status_code=404)
    db["lifeguards"].delete_one({"username": username.strip()})
    return {"status": "deleted", "lifeguards": list(db["lifeguards"].find({"created_by": admin_id}, {"_id": 0}))}

@app.get("/browse")
def browse_folder():
    if tk is None or filedialog is None: return {"path": "./recordings"}
    try:
        root = tk.Tk(); root.withdraw(); root.attributes('-topmost', True)
        folder_path = filedialog.askdirectory(); root.destroy()
        return {"path": folder_path}
    except: return {"path": "./recordings"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)