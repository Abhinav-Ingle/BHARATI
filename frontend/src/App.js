import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { LayoutDashboard, Video, Bell, Shield, UserX, WifiOff, LogOut, Lock, RefreshCw, CheckCircle, XCircle, Loader2, CheckSquare, Settings, Save, AlertTriangle, Activity, MapPin, Users, Trash2 } from 'lucide-react';
import './App.css';

// Fix for Leaflet Icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png')
});

// IMPORTANT: Replace this with your actual Render URL
const API_URL = "https://bharati.onrender.com";

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

  // Settings & Lifeguard States
  const [settings, setSettings] = useState({
    danger_threshold: 85.0, min_person_pixels: 67, record_duration: 8, save_directory: "./recordings",
    enable_log: true, enable_sms: true, enable_siren: true, sms_phone_number: "8010057119"
  });
  const [lifeguards, setLifeguards] = useState([]);
  const [newGuard, setNewGuard] = useState({ name: "", mobile: "", username: "", password: "" });


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

  // Hardware Check (Browser Camera)
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
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (res.ok) {
            const result = await res.json();
            setUserRole(result.role); 
            setIsLoggedIn(true);
            if (!audioCtxRef.current) { audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)(); }
            audioCtxRef.current.resume(); 
            
            // Fetch initial configuration data
            fetchSettings();
            if(result.role === 'admin') fetchLifeguards(result.username);
        } else { alert("Invalid Credentials"); }
    } catch (err) { alert("Server Error: Cannot reach Backend Database"); }
  };

  // -----------------------------------------------------------
  // WEB CAMERA STREAMING ENGINE
  // -----------------------------------------------------------
  useEffect(() => {
    let currentVideo = videoRef.current; // Save ref to variable for cleanup
    
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
            
            if (currentVideo.videoWidth === 0) return; // Video not ready yet
            
            canvas.width = currentVideo.videoWidth;
            canvas.height = currentVideo.videoHeight;
            ctx.drawImage(currentVideo, 0, 0, canvas.width, canvas.height);
            
            // Compress frame and send to Render backend
            const frameBase64 = canvas.toDataURL('image/jpeg', 0.5); 
            
            try {
                const response = await fetch(`${API_URL}/process_frame`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cam_id: "CAM-01", image: frameBase64 })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    setProcessedImage(result.processed_image);
                }
            } catch (err) { /* Silent fail */ }
        };

        // Send a frame to the cloud every 500ms (2 FPS)
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
        fetch(`${API_URL}/status`)
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
        const res = await fetch(`${API_URL}/settings`);
        if (res.ok) setSettings(await res.json());
    } catch (e) {}
  };

  const handleSaveSettings = async () => {
    try {
        const res = await fetch(`${API_URL}/settings`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        if (res.ok) alert("Configuration Saved Successfully");
    } catch (e) { alert("Failed to save configuration"); }
  };

  // --- Lifeguard Database Handling ---
  const fetchLifeguards = async (adminId) => {
    try {
        const res = await fetch(`${API_URL}/lifeguards?admin_id=${adminId || username}`);
        if (res.ok) setLifeguards(await res.json());
    } catch (e) {}
  };

  const handleAddLifeguard = async (e) => {
    e.preventDefault();
    try {
        const payload = { ...newGuard, created_by: username };
        const res = await fetch(`${API_URL}/lifeguards`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const responseData = await res.json();
            setLifeguards(responseData.lifeguards);
            setNewGuard({ name: "", mobile: "", username: "", password: "" });
            alert("Lifeguard added.");
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
            method: 'DELETE'
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

      <div className="main-content-area">
        
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
                        <h4 className="panel-title">Safety Summary</h4>
                        <div className="kpi-row">
                            <div className="kpi-col"><small style={{color:'#7dd3fc'}}>TOTAL DETECTED</small><span className="text-primary">{globalDetected}</span></div>
                            <div className="kpi-col"><small style={{color:'#34d399'}}>SAFE ZONE</small><span>{globalSafe}</span></div>
                            <div className="kpi-col"><small style={{color:'#fca5a5'}}>DANGER ZONE</small><span className="text-danger">{globalDanger}</span></div>
                        </div>
                    </div>
                    <div className="side-panel-card" style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
                        <h4 className="panel-title">Beach Alerts</h4>
                        <div className="alerts-list" style={{flex: 1, overflowY: 'auto'}}>
                            {notifications.slice(0, 4).map((note) => (
                                <div key={note.id} className="dash-alert-item" style={{padding: '12px', gap: '12px'}}>
                                    <div className={`alert-indicator ${note.type === 'danger' ? 'bg-red' : note.type === 'success' ? 'bg-green' : 'bg-yellow'}`} style={{minWidth: '24px', height: '24px'}}>
                                        {note.type === 'danger' && <AlertTriangle size={12} color="#000" />}
                                        {note.type === 'success' && <CheckSquare size={12} color="#000" />}
                                        {note.type === 'info' && <Bell size={12} color="#000" />}
                                    </div>
                                    <div className="alert-content">
                                        <div className="alert-top" style={{fontSize: '0.85rem'}}>
                                            <strong style={{color: note.type === 'danger' ? '#fca5a5' : '#eab308'}}>{activeCam} Alert</strong> <span style={{float: 'right', fontSize: '0.7rem', color: '#94a3b8'}}>{note.time}</span>
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
             <div className="settings-wrapper" style={{padding: '20px', color: 'white'}}>
                 <h2 style={{marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px'}}><Settings /> System Configuration</h2>
                 
                 <div className="settings-grid" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
                     <div className="settings-card" style={{background: '#1e293b', padding: '20px', borderRadius: '12px'}}>
                         <h4 style={{marginBottom: '15px', color: '#38bdf8'}}>Detection Parameters</h4>
                         <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                             <div>
                                 <label style={{display: 'block', fontSize: '0.85rem', marginBottom: '5px'}}>Danger Proximity Threshold (pixels)</label>
                                 <input type="number" style={{width: '100%', padding: '8px', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: 'white'}}
                                    value={settings.danger_threshold} onChange={(e) => setSettings({...settings, danger_threshold: parseFloat(e.target.value)})} />
                             </div>
                             <div>
                                 <label style={{display: 'block', fontSize: '0.85rem', marginBottom: '5px'}}>WhatsApp Target Numbers (Comma separated)</label>
                                 <input type="text" style={{width: '100%', padding: '8px', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: 'white'}}
                                    value={settings.sms_phone_number} onChange={(e) => setSettings({...settings, sms_phone_number: e.target.value})} />
                             </div>
                         </div>
                     </div>

                     <div className="settings-card" style={{background: '#1e293b', padding: '20px', borderRadius: '12px'}}>
                         <h4 style={{marginBottom: '15px', color: '#38bdf8'}}>System Actions</h4>
                         <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                             <label style={{display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer'}}>
                                 <input type="checkbox" checked={settings.enable_siren} onChange={(e) => setSettings({...settings, enable_siren: e.target.checked})} />
                                 Enable Audio Siren on Danger
                             </label>
                             <label style={{display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer'}}>
                                 <input type="checkbox" checked={settings.enable_sms} onChange={(e) => setSettings({...settings, enable_sms: e.target.checked})} />
                                 Enable WhatsApp Alert Dispatch
                             </label>
                             <label style={{display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer'}}>
                                 <input type="checkbox" checked={settings.enable_log} onChange={(e) => setSettings({...settings, enable_log: e.target.checked})} />
                                 Log Events to Dashboard
                             </label>
                         </div>
                     </div>
                 </div>

                 <button onClick={handleSaveSettings} style={{marginTop: '20px', padding: '10px 20px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'}}>
                     <Save size={18} /> Apply Changes
                 </button>
             </div>
        )}

        {/* VIEW 4: LIFEGUARDS (Admin Only) */}
        {currentView === 'lifeguards' && userRole === 'admin' && (
             <div className="lifeguards-wrapper" style={{padding: '20px', color: 'white'}}>
                 <h2 style={{marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px'}}><Users /> Lifeguard Management</h2>
                 
                 <div className="lifeguard-split" style={{display: 'flex', gap: '20px'}}>
                     {/* Add Lifeguard Form */}
                     <div className="settings-card" style={{flex: 1, background: '#1e293b', padding: '20px', borderRadius: '12px', height: 'fit-content'}}>
                         <h4 style={{marginBottom: '15px', color: '#34d399'}}>Register New Lifeguard</h4>
                         <form onSubmit={handleAddLifeguard} style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                             <div>
                                 <label style={{fontSize: '0.8rem', display: 'block', marginBottom: '4px'}}>Full Name</label>
                                 <input type="text" required value={newGuard.name} onChange={(e)=>setNewGuard({...newGuard, name: e.target.value})} style={{width: '100%', padding: '8px', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: 'white'}} />
                             </div>
                             <div>
                                 <label style={{fontSize: '0.8rem', display: 'block', marginBottom: '4px'}}>Mobile Number (For WhatsApp)</label>
                                 <input type="text" required value={newGuard.mobile} onChange={(e)=>setNewGuard({...newGuard, mobile: e.target.value})} style={{width: '100%', padding: '8px', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: 'white'}} />
                             </div>
                             <div>
                                 <label style={{fontSize: '0.8rem', display: 'block', marginBottom: '4px'}}>Login Username</label>
                                 <input type="text" required value={newGuard.username} onChange={(e)=>setNewGuard({...newGuard, username: e.target.value})} style={{width: '100%', padding: '8px', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: 'white'}} />
                             </div>
                             <div>
                                 <label style={{fontSize: '0.8rem', display: 'block', marginBottom: '4px'}}>Login Password</label>
                                 <input type="password" required value={newGuard.password} onChange={(e)=>setNewGuard({...newGuard, password: e.target.value})} style={{width: '100%', padding: '8px', borderRadius: '4px', background: '#0f172a', border: '1px solid #334155', color: 'white'}} />
                             </div>
                             <button type="submit" style={{marginTop: '10px', padding: '10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
                                 + Register Lifeguard
                             </button>
                         </form>
                     </div>

                     {/* Lifeguards Roster */}
                     <div className="settings-card" style={{flex: 2, background: '#1e293b', padding: '20px', borderRadius: '12px'}}>
                         <h4 style={{marginBottom: '15px', color: '#38bdf8'}}>Active Roster</h4>
                         <div style={{background: '#0f172a', borderRadius: '8px', overflow: 'hidden'}}>
                             <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left'}}>
                                 <thead>
                                     <tr style={{background: '#334155', color: '#94a3b8', fontSize: '0.85rem'}}>
                                         <th style={{padding: '12px'}}>Name</th>
                                         <th style={{padding: '12px'}}>Username</th>
                                         <th style={{padding: '12px'}}>Mobile</th>
                                         <th style={{padding: '12px', textAlign: 'center'}}>Actions</th>
                                     </tr>
                                 </thead>
                                 <tbody>
                                     {lifeguards.length === 0 ? (
                                         <tr><td colSpan="4" style={{padding: '20px', textAlign: 'center', color: '#64748b'}}>No lifeguards registered yet.</td></tr>
                                     ) : (
                                         lifeguards.map((guard, idx) => (
                                             <tr key={idx} style={{borderBottom: '1px solid #1e293b'}}>
                                                 <td style={{padding: '12px'}}>{guard.name}</td>
                                                 <td style={{padding: '12px'}}>{guard.username}</td>
                                                 <td style={{padding: '12px'}}>{guard.mobile}</td>
                                                 <td style={{padding: '12px', textAlign: 'center'}}>
                                                     <button onClick={() => handleDeleteLifeguard(guard.username)} style={{background: 'transparent', border: 'none', color: '#fca5a5', cursor: 'pointer'}} title="Remove">
                                                         <Trash2 size={18} />
                                                     </button>
                                                 </td>
                                             </tr>
                                         ))
                                     )}
                                 </tbody>
                             </table>
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