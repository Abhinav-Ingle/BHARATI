import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { LayoutDashboard, Video, Bell, Shield, UserX, WifiOff, LogOut, Lock, RefreshCw, CheckCircle, XCircle, Loader2, CheckSquare, Settings, Save, AlertTriangle, Activity, MapPin, Users, Trash2, List, Volume2, Smartphone, Phone, UserPlus, Edit2, Folder } from 'lucide-react';
import './App.css';

// Fix for Leaflet Icons in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png')
});

const API_URL = "https://testbharatibackend.shares.zrok.io";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  
  const [currentView, setCurrentView] = useState('cameras');
  const [cameraReady, setCameraReady] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState("");

  const [data, setData] = useState({ threat_level: "SAFE", threat_source: null, cameras: [] });
  const [notifications, setNotifications] = useState([{ id: 1, time: "System", msg: "System Online", type: "info" }]);
  const prevCamStates = useRef({}); 
  const audioCtxRef = useRef(null);

  const [activeCam, setActiveCam] = useState('CAM-01');

  // Web Camera Variables
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [processedImage, setProcessedImage] = useState(null);
  const isStreaming = useRef(false);

  // Settings, HQ & Lifeguard States
  const [settings, setSettings] = useState({
    danger_threshold: 385, min_person_pixels: 67, record_duration: 8, save_directory: "C:\\Users\\Desktop\\BHARATI\\backend\\recordings",
    enable_log: true, enable_sms: true, enable_siren: true, sms_phone_number: ""
  });
  const [lifeguards, setLifeguards] = useState([]);
  const [newGuard, setNewGuard] = useState({ name: "", mobile: "", username: "", password: "" });
  
  // NEW: Dedicated states for compiling the WhatsApp numbers
  const [hqNumber, setHqNumber] = useState("");
  const [selectedGuardMobiles, setSelectedGuardMobiles] = useState([]);

  // Initialize selected guards when lifeguards are loaded
  useEffect(() => {
    if (lifeguards.length > 0 && selectedGuardMobiles.length === 0) {
        setSelectedGuardMobiles(lifeguards.map(g => g.mobile));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifeguards]);

  // Audio Siren
  const playSiren = () => {
    try {
        if (!audioCtxRef.current) { audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)(); }
        const ctx = audioCtxRef.current;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.type = 'sawtooth'; 
        oscillator.frequency.setValueAtTime(880, ctx.currentTime); 
        oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5); 
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime); 
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5); 
        oscillator.connect(gainNode); gainNode.connect(ctx.destination);
        oscillator.start(); oscillator.stop(ctx.currentTime + 0.5); 
    } catch (e) { }
  };

  // Hardware Check
  const checkHardware = async () => {
    setIsChecking(true);
    setCheckMessage("");
    try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        setCameraReady(true); 
        setCheckMessage("SUCCESS: Device Camera Ready.");
    } catch (err) {
        setCameraReady(false); 
        setCheckMessage("ERROR: Please allow camera permissions.");
    }
    setIsChecking(false);
  };

  // Login Handler
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'skip_zrok_interstitial': 'true'
            },
            body: JSON.stringify({ username, password })
        });
        if (res.ok) {
            const result = await res.json();
            setUserRole(result.role); 
            setIsLoggedIn(true);
            if (!audioCtxRef.current) { audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)(); }
            audioCtxRef.current.resume(); 
            
            fetchSettings();
            if(result.role === 'admin') fetchLifeguards(result.username);
        } else { alert("Invalid Credentials"); }
    } catch (err) { alert("Server Error: Cannot reach Backend Database"); }
  };

  // -----------------------------------------------------------
  // WEB CAMERA STREAMING ENGINE
  // -----------------------------------------------------------
  useEffect(() => {
    let currentVideo = videoRef.current; 
    
    if (isLoggedIn && currentView === 'cameras' && activeCam === 'CAM-01') {
        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (currentVideo) {
                    currentVideo.srcObject = stream;
                    isStreaming.current = true;
                }
            } catch (err) { console.error("Camera access denied"); }
        };
        startCamera();

        const captureAndSendFrame = async () => {
            if (!currentVideo || !canvasRef.current || !isStreaming.current) return;
            
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            
            if (currentVideo.videoWidth === 0) return; 
            
            canvas.width = currentVideo.videoWidth;
            canvas.height = currentVideo.videoHeight;
            ctx.drawImage(currentVideo, 0, 0, canvas.width, canvas.height);
            
            const frameBase64 = canvas.toDataURL('image/jpeg', 0.5); 
            
            try {
                const response = await fetch(`${API_URL}/process_frame`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'skip_zrok_interstitial': 'true' 
                    },
                    body: JSON.stringify({ cam_id: "CAM-01", image: frameBase64 })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    setProcessedImage(result.processed_image);
                }
            } catch (err) { /* Silent fail */ }
        };

        const frameInterval = setInterval(captureAndSendFrame, 500);

        return () => {
            clearInterval(frameInterval);
            isStreaming.current = false;
            if (currentVideo && currentVideo.srcObject) {
                currentVideo.srcObject.getTracks().forEach(track => track.stop());
            }
        };
    }
  }, [isLoggedIn, currentView, activeCam]);


  // Polling for Dashboard Status Data
  useEffect(() => {
    if (isLoggedIn) {
      const interval = setInterval(() => {
        fetch(`${API_URL}/status`, {
            headers: { 'skip_zrok_interstitial': 'true' }
        })
          .then(res => res.json())
          .then(result => {
            setData(result);
            let systemHasThreat = false;
            result.cameras.forEach(cam => {
                const wasDanger = prevCamStates.current[cam.id] || false; 
                const isDanger = cam.has_threat;
                if (isDanger) systemHasThreat = true;
                if (settings.enable_log) {
                    if (!wasDanger && isDanger) addNotification(`CRITICAL: Threat on ${cam.id}`, "danger");
                    if (wasDanger && !isDanger) addNotification(`Threat cleared on ${cam.id}`, "success");
                }
                prevCamStates.current[cam.id] = isDanger;
            });
            if (systemHasThreat && settings.enable_siren) { playSiren(); }
          }).catch(() => {});
      }, 1000); 
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, settings.enable_log, settings.enable_siren]);

  const addNotification = (msg, type) => { setNotifications(prev => [{ id: Date.now(), time: new Date().toLocaleTimeString(), msg: msg, type: type }, ...prev].slice(0, 50)); };

  // --- Settings Data Fetching & Saving ---
  const fetchSettings = async () => {
    try {
        const res = await fetch(`${API_URL}/settings`, {
            headers: { 'skip_zrok_interstitial': 'true' }
        });
        if (res.ok) {
            const fetchedSettings = await res.json();
            setSettings(fetchedSettings);
        }
    } catch (e) {}
  };

  const handleSaveSettings = async () => {
    // Combine HQ Number with Checked Lifeguards
    const combinedNumbers = [hqNumber, ...selectedGuardMobiles].filter(n => n && n.trim() !== "");
    const finalSettingsPayload = { ...settings, sms_phone_number: combinedNumbers.join(",") };

    try {
        const res = await fetch(`${API_URL}/settings`, {
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'skip_zrok_interstitial': 'true'
            },
            body: JSON.stringify(finalSettingsPayload)
        });
        if (res.ok) alert("Configuration Saved Successfully");
    } catch (e) { alert("Failed to save configuration"); }
  };

  // --- Lifeguard Database Handling ---
  const fetchLifeguards = async (adminId) => {
    try {
        const res = await fetch(`${API_URL}/lifeguards?admin_id=${adminId || username}`, {
            headers: { 'skip_zrok_interstitial': 'true' }
        });
        if (res.ok) {
            const fetchedGuards = await res.json();
            setLifeguards(fetchedGuards);
            setSelectedGuardMobiles(fetchedGuards.map(g => g.mobile)); // Auto-select all fetched guards
        }
    } catch (e) {}
  };

  const handleAddLifeguard = async (e) => {
    e.preventDefault();
    try {
        const payload = { ...newGuard, created_by: username };
        const res = await fetch(`${API_URL}/lifeguards`, {
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'skip_zrok_interstitial': 'true'
            },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const responseData = await res.json();
            setLifeguards(responseData.lifeguards);
            setNewGuard({ name: "", mobile: "", username: "", password: "" });
        } else {
            const errData = await res.json();
            alert(`Error: ${errData.detail}`);
        }
    } catch (e) { alert("Failed to add lifeguard"); }
  };

  const handleDeleteLifeguard = async (guardUsername) => {
    if (!window.confirm(`Are you sure you want to remove ${guardUsername}?`)) return;
    try {
        const res = await fetch(`${API_URL}/lifeguards/${guardUsername}?admin_id=${username}`, {
            method: 'DELETE',
            headers: { 'skip_zrok_interstitial': 'true' }
        });
        if (res.ok) {
            const responseData = await res.json();
            setLifeguards(responseData.lifeguards);
        }
    } catch (e) { alert("Failed to delete lifeguard"); }
  };

  // --- LOGIN SCREEN ---
  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="login-header"> 
            <Shield size={40} className="text-cyan-400" /> 
            <h1>BHARATI <span className="text-sm opacity-50">ACCESS CONTROL</span></h1> 
          </div>
          <div className="hardware-check-section">
            <button type="button" className="check-btn" onClick={checkHardware} disabled={isChecking}>
                {isChecking ? <Loader2 className="spin" size={18}/> : <RefreshCw size={18}/>} {isChecking ? "DIAGNOSING..." : "VERIFY SYSTEMS"}
            </button>
            {checkMessage && <div className={`status-msg ${cameraReady ? 'success' : 'fail'}`}> {cameraReady ? <CheckCircle size={16}/> : <XCircle size={16}/>} {checkMessage} </div>}
          </div>
          <form onSubmit={handleLogin} className="login-form">
             <div className="input-group"> <label>Operator ID</label> <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter ID" /> </div>
            <div className="input-group"> <label>Password</label> <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="•••••••" /> </div>
            <button type="submit" className="login-btn" disabled={!cameraReady}> {!cameraReady ? <><Lock size={16}/> LOCKED</> : "AUTHENTICATE & ENTER"} </button>
          </form>
        </div>
      </div>
    );
  }

  const activeCamData = data.cameras.find(c => c.id === activeCam) || {};
  const globalDetected = data.cameras.reduce((sum, cam) => sum + (cam.people_count || 0), 0);
  const globalDanger = data.cameras.reduce((sum, cam) => sum + (cam.danger_count || 0), 0);
  const globalSafe = Math.max(0, globalDetected - globalDanger);

  // --- DASHBOARD RENDER ---
  return (
    <div className="dashboard-container">
      {/* Hidden elements needed for the web camera stream */}
      <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }}></video>
      <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

      <div className="sidebar">
        <div className="brand"><Shield size={24} /> BHARATI</div>
        <div className="nav-buttons">
            <button className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentView('dashboard')}> <LayoutDashboard size={16}/> Dashboard </button>
            <button className={`nav-btn ${currentView === 'cameras' ? 'active' : ''}`} onClick={() => setCurrentView('cameras')}> <Video size={16}/> Cameras </button>
            <button className={`nav-btn ${currentView === 'settings' ? 'active' : ''}`} onClick={() => setCurrentView('settings')}> <Settings size={16}/> Settings </button>
            
            {userRole === 'admin' && (
                <button className={`nav-btn ${currentView === 'lifeguards' ? 'active' : ''}`} onClick={() => setCurrentView('lifeguards')}> <Users size={16}/> Lifeguards </button>
            )}
        </div>
        <button className="logout-btn" onClick={() => {setIsLoggedIn(false); setUsername(''); setPassword(''); setUserRole(null);}}><LogOut size={20} /> LOGOUT</button>
      </div>

      <div className="main-content-area" style={{ padding: '30px', overflowY: 'auto', height: '100vh' }}>
        
        {/* VIEW 1: DASHBOARD */}
        {currentView === 'dashboard' && (
            <div className="dashboard-wrapper">
                <div className="kpi-ribbon">
                    <div className="kpi-card"> <div className="kpi-icon safe"><Shield size={24}/></div> <div className="kpi-data"> <span className="kpi-label">Active Lifeguards</span> <span className="kpi-value">{lifeguards.length}</span> </div> </div>
                    <div className="kpi-card"> <div className="kpi-icon danger"><AlertTriangle size={24}/></div> <div className="kpi-data"> <span className="kpi-label">Active Incidents</span> <span className="kpi-value text-danger">{data.cameras.filter(c => c.has_threat).length}</span> </div> </div>
                    <div className="kpi-card"> <div className="kpi-icon primary"><Activity size={24}/></div> <div className="kpi-data"> <span className="kpi-label">Rescues Today</span> <span className="kpi-value text-primary">12</span> </div> </div>
                    <div className="kpi-card"> <div className="kpi-icon danger"><UserX size={24}/></div> <div className="kpi-data"> <span className="kpi-label">Drowning Cases</span> <span className="kpi-value text-danger">2</span> </div> </div>
                </div>
                <div className="dashboard-middle-grid">
                    <div className="map-container-card">
                        <h3 className="section-header"><MapPin size={18}/> Live Beach Map</h3>
                        <div className="map-frame">
                            <MapContainer center={[17.7820, 83.3765]} zoom={13} style={{ height: '100%', width: '100%', borderRadius: '12px' }}>
                                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                                <Marker position={[17.7820, 83.3765]}> <Popup>Main Beach / Zone Alpha</Popup> </Marker>
                            </MapContainer>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* VIEW 2: CAMERAS */}
        {currentView === 'cameras' && (
            <div className="cameras-layout">
                <div className="cameras-left">
                    <div className="hero-cam-container">
                        <div className="hero-header">
                            <span className="hero-cam-title">LIVE CAMERA FEED - {activeCam}</span>
                            {activeCamData.status === 'online' ? <span className="badge online" style={{background: 'rgba(0,0,0,0.5)'}}>● LIVE</span> : <span className="badge offline">● LOST</span>}
                        </div>
                        
                        <div className="hero-overlays">
                            <div className="hero-date-weather">
                                <div className="overlay-box" style={{display:'flex', flexDirection:'column', padding: '8px 12px'}}>
                                    <span style={{fontWeight:'800', fontSize: '0.85rem'}}>{new Date().toLocaleTimeString()}</span>
                                    <small style={{fontSize: '0.65rem'}}>{new Date().toLocaleDateString()}</small>
                                </div>
                            </div>
                            
                            {activeCamData.has_threat && (
                                <div style={{alignSelf: 'center', background: '#ef4444', color: 'white', padding: '6px 16px', borderRadius: '4px', fontWeight: '900', fontSize: '0.85rem', animation: 'flash 1s infinite', letterSpacing: '1px'}}>
                                    RIP CURRENT DETECTED
                                </div>
                            )}
                            
                            <div className="overlay-box hero-stats" style={{padding: '10px', width: '180px'}}>
                                <div style={{borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom:'5px', marginBottom:'5px', fontWeight:'800', fontSize: '0.7rem'}}>PEOPLE COUNT</div>
                                <div style={{display:'flex', justifyContent:'space-between', marginBottom: '3px', fontSize: '0.75rem'}}><span>Total Detected:</span> <span style={{fontWeight: '700'}}>{activeCamData.people_count || 0}</span></div>
                                <div style={{display:'flex', justifyContent:'space-between', marginBottom: '3px', color:'#34d399', fontSize: '0.75rem'}}><span>Safe Zone:</span> <span style={{fontWeight: '700'}}>{Math.max(0, (activeCamData.people_count || 0) - (activeCamData.danger_count || 0))}</span></div>
                                <div style={{display:'flex', justifyContent:'space-between', color:'#fca5a5', fontSize: '0.75rem'}}><span>Danger Zone:</span> <span style={{fontWeight: '700'}}>{activeCamData.danger_count || 0}</span></div>
                            </div>
                        </div>

                        <div className="video-wrapper"> 
                            {activeCam === 'CAM-01' ? (
                                processedImage ? <img src={processedImage} className="grid-feed" alt="Processed Feed" /> : <div className="offline-placeholder"><Loader2 className="spin" size={40}/> INITIATING CLOUD INFERENCE...</div>
                            ) : (
                                <div className="offline-placeholder"><WifiOff size={40}/> NO SIGNAL</div>
                            )}
                        </div>
                    </div>

                    <div className="cam-carousel">
                        {data.cameras.map(cam => (
                            <div key={cam.id} className={`carousel-item ${activeCam === cam.id ? 'active-cam' : ''} ${cam.has_threat ? 'danger-border' : ''}`} onClick={() => setActiveCam(cam.id)}>
                                <div className="carousel-vid">
                                    {cam.id === 'CAM-01' && processedImage ? 
                                        <img src={processedImage} alt={cam.id} /> 
                                    : 
                                        <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center'}}><WifiOff size={24} style={{opacity:0.3}}/></div>
                                    }
                                </div>
                                <div className="carousel-footer">
                                    <span style={{fontWeight:'700'}}>{cam.id}</span>
                                    {cam.has_threat && <AlertTriangle size={14} color="#fca5a5"/>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="cameras-right">
                    <div className="side-panel-card">
                        <h4 className="panel-title">SAFETY SUMMARY</h4>
                        <div className="kpi-row">
                            <div className="kpi-col"><small style={{color:'#0ea5e9'}}>TOTAL DETECTED</small><span className="text-primary" style={{fontSize: '1.5rem'}}>{globalDetected}</span></div>
                            <div className="kpi-col"><small style={{color:'#34d399'}}>SAFE ZONE</small><span style={{fontSize: '1.5rem'}}>{globalSafe}</span></div>
                            <div className="kpi-col"><small style={{color:'#ef4444'}}>DANGER ZONE</small><span className="text-danger" style={{fontSize: '1.5rem'}}>{globalDanger}</span></div>
                        </div>
                    </div>
                    <div className="side-panel-card" style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
                        <h4 className="panel-title">BEACH ALERTS</h4>
                        <div className="alerts-list" style={{flex: 1, overflowY: 'auto'}}>
                            {notifications.slice(0, 4).map((note) => (
                                <div key={note.id} className="dash-alert-item" style={{padding: '12px', gap: '12px'}}>
                                    <div className={`alert-indicator ${note.type === 'danger' ? 'bg-red' : note.type === 'success' ? 'bg-green' : 'bg-yellow'}`} style={{minWidth: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eab308'}}>
                                        {note.type === 'danger' && <AlertTriangle size={16} color="#000" />}
                                        {note.type === 'success' && <CheckSquare size={16} color="#000" />}
                                        {note.type === 'info' && <Bell size={16} color="#000" />}
                                    </div>
                                    <div className="alert-content">
                                        <div className="alert-top" style={{fontSize: '0.9rem'}}>
                                            <strong style={{color: note.type === 'danger' ? '#ef4444' : '#facc15'}}>{activeCam} Alert</strong> 
                                        </div>
                                        <div className="alert-bot" style={{fontSize: '0.8rem', color: '#e2e8f0', marginTop: '2px'}}>{note.msg}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* VIEW 3: SETTINGS */}
        {currentView === 'settings' && (
             <div className="settings-wrapper" style={{color: '#e2e8f0', maxWidth: '650px'}}>
                 <h2 style={{marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.8rem', fontWeight: '600'}}>
                    <Settings size={28}/> System Configuration
                 </h2>

                 <div style={{background: '#1e293b', padding: '30px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)'}}>
                     <h4 style={{marginBottom: '20px', color: '#0ea5e9', fontSize: '0.85rem', letterSpacing: '1px', fontWeight: '700', textTransform: 'uppercase'}}>SYSTEM PARAMETERS</h4>
                     <p style={{fontSize: '0.85rem', color: '#e2e8f0', marginBottom: '10px', fontWeight: '600'}}>Alert Preferences</p>

                     <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '25px'}}>
                         <label className="custom-check-row">
                             <input type="checkbox" checked={settings.enable_log} onChange={(e) => setSettings({...settings, enable_log: e.target.checked})} />
                             <span className="check-box"></span>
                             <List size={18} /> Activity Log Notification
                         </label>
                         <label className="custom-check-row">
                             <input type="checkbox" checked={settings.enable_siren} onChange={(e) => setSettings({...settings, enable_siren: e.target.checked})} />
                             <span className="check-box"></span>
                             <Volume2 size={18} /> Audio Siren
                         </label>
                         <label className="custom-check-row">
                             <input type="checkbox" checked={settings.enable_sms} onChange={(e) => setSettings({...settings, enable_sms: e.target.checked})} />
                             <span className="check-box"></span>
                             <Smartphone size={18} /> WhatsApp Notification
                         </label>
                     </div>

                     {/* Notify Lifeguards Area (NOW FULLY FUNCTIONAL) */}
                     <div style={{background: '#0f172a', padding: '20px', borderRadius: '12px', marginBottom: '25px'}}>
                        <p style={{fontSize: '0.85rem', color: '#94a3b8', marginBottom: '15px'}}>Notify these lifeguards:</p>
                        {lifeguards.length > 0 ? (
                            lifeguards.map((guard, idx) => {
                                const isChecked = selectedGuardMobiles.includes(guard.mobile);
                                return (
                                     <label key={idx} className="custom-check-row" style={{marginBottom: '10px', padding: '10px', background: '#1e293b'}}>
                                         <input 
                                            type="checkbox" 
                                            checked={isChecked}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedGuardMobiles([...selectedGuardMobiles, guard.mobile]);
                                                } else {
                                                    setSelectedGuardMobiles(selectedGuardMobiles.filter(m => m !== guard.mobile));
                                                }
                                            }}
                                         />
                                         <span className="check-box"></span>
                                         <span style={{fontWeight: '600'}}>{guard.name}</span> <span style={{color: '#64748b', fontSize: '0.85rem'}}>({guard.mobile})</span>
                                     </label>
                                )
                            })
                        ) : (
                            <p style={{color: '#64748b', fontSize: '0.85rem'}}>No active lifeguards found.</p>
                        )}

                        <div style={{marginTop: '20px'}}>
                            <label style={{fontSize: '0.8rem', color: '#0ea5e9', display: 'block', marginBottom: '8px', fontWeight: '600'}}>Emergency / HQ Number</label>
                            <div style={{display: 'flex', alignItems: 'center', background: '#1e293b', borderRadius: '8px', padding: '0 12px'}}>
                                <Phone size={16} color="#64748b" />
                                <input type="text" placeholder="+91..." value={hqNumber} onChange={(e) => setHqNumber(e.target.value)} style={{background: 'transparent', border: 'none', color: 'white', padding: '12px', width: '100%', outline: 'none'}} />
                            </div>
                        </div>
                     </div>

                     {/* Sliders */}
                     <div style={{marginBottom: '25px'}}>
                         <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '15px'}}>
                             <label style={{fontSize: '0.85rem', fontWeight: '600', color: '#e2e8f0'}}>Safe Distance Threshold (Pixels)</label>
                             <span style={{background: '#0ea5e9', padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold'}}>{settings.danger_threshold} px</span>
                         </div>
                         <input type="range" min="50" max="600" value={settings.danger_threshold} onChange={(e) => setSettings({...settings, danger_threshold: parseInt(e.target.value)})} className="styled-slider" />
                     </div>

                     <div style={{marginBottom: '35px'}}>
                         <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '15px'}}>
                             <label style={{fontSize: '0.85rem', fontWeight: '600', color: '#e2e8f0'}}>Capture Duration (Max 10s)</label>
                             <span style={{background: '#0ea5e9', padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold'}}>{settings.record_duration} sec</span>
                         </div>
                         <input type="range" min="1" max="10" value={settings.record_duration} onChange={(e) => setSettings({...settings, record_duration: parseInt(e.target.value)})} className="styled-slider" />
                     </div>
                     
                     <div style={{marginBottom: '30px'}}>
                         <label style={{display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: '600', color: '#e2e8f0', marginBottom: '10px'}}><Folder size={16}/> Save Directory</label>
                         <div style={{display: 'flex', gap: '10px'}}>
                             <input type="text" value={settings.save_directory} readOnly className="styled-input" style={{flex: 1, color: '#94a3b8'}} />
                             <button style={{background: '#334155', color: 'white', border: 'none', borderRadius: '8px', padding: '0 20px', cursor: 'pointer', fontWeight: '600'}}>Select</button>
                         </div>
                     </div>

                     <button onClick={handleSaveSettings} className="save-btn-large">
                         <Save size={18} /> Apply & Save Settings
                     </button>
                 </div>
             </div>
        )}

        {/* VIEW 4: LIFEGUARDS */}
        {currentView === 'lifeguards' && userRole === 'admin' && (
             <div className="lifeguards-wrapper" style={{color: '#e2e8f0'}}>
                 <h2 style={{marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.8rem', fontWeight: '600'}}>
                     <Users size={28}/> Staff Management
                 </h2>

                 <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px'}}>

                     {/* Register New Lifeguard */}
                     <div style={{background: '#1e293b', padding: '30px', borderRadius: '16px', height: 'fit-content', boxShadow: '0 4px 20px rgba(0,0,0,0.2)'}}>
                         <h4 style={{marginBottom: '20px', color: '#0ea5e9', fontSize: '0.85rem', letterSpacing: '1px', fontWeight: '700', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px'}}><UserPlus size={16}/> REGISTER NEW LIFEGUARD</h4>

                         <form onSubmit={handleAddLifeguard} style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                             <input type="text" placeholder="Full Name" required value={newGuard.name} onChange={(e)=>setNewGuard({...newGuard, name: e.target.value})} className="styled-input" />
                             <input type="text" placeholder="Mobile Number" required value={newGuard.mobile} onChange={(e)=>setNewGuard({...newGuard, mobile: e.target.value})} className="styled-input" />
                             <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px'}}>
                                 <input type="text" placeholder="Username (ID)" required value={newGuard.username} onChange={(e)=>setNewGuard({...newGuard, username: e.target.value})} className="styled-input" />
                                 <input type="password" placeholder="Password" required value={newGuard.password} onChange={(e)=>setNewGuard({...newGuard, password: e.target.value})} className="styled-input" />
                             </div>
                             <button type="submit" className="save-btn-large" style={{marginTop: '10px'}}>
                                 <Save size={18} /> Save Credentials
                             </button>
                         </form>
                     </div>

                     {/* Active Staff Directory */}
                     <div style={{background: '#1e293b', padding: '30px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)'}}>
                         <h4 style={{marginBottom: '20px', color: '#0ea5e9', fontSize: '0.85rem', letterSpacing: '1px', fontWeight: '700', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px'}}><Users size={16}/> ACTIVE STAFF DIRECTORY</h4>

                         <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                             {lifeguards.length === 0 ? (
                                 <p style={{color: '#64748b'}}>No staff registered.</p>
                             ) : (
                                 lifeguards.map((guard, idx) => (
                                     <div key={idx} className="staff-card">
                                         <div>
                                             <h5 style={{margin: '0 0 4px 0', fontSize: '1rem', fontWeight: '700'}}>{guard.name}</h5>
                                             <p style={{margin: '0', fontSize: '0.8rem', color: '#94a3b8'}}>{guard.mobile}</p>
                                             <p style={{margin: '4px 0 0 0', fontSize: '0.8rem', color: '#0ea5e9'}}>@{guard.username}</p>
                                         </div>
                                         <div style={{display: 'flex', gap: '8px'}}>
                                             <button className="icon-btn edit-btn"><Edit2 size={14}/></button>
                                             <button onClick={() => handleDeleteLifeguard(guard.username)} className="icon-btn delete-btn"><Trash2 size={14}/></button>
                                         </div>
                                     </div>
                                 ))
                             )}
                         </div>
                     </div>

                 </div>
             </div>
        )}

      </div>
    </div>
  );
}

export default App;