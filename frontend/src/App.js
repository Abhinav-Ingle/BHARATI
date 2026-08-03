import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { LayoutDashboard, Video, Bell, Shield, UserX, WifiOff, LogOut, Lock, RefreshCw, CheckCircle, XCircle, Loader2, CheckSquare, Settings, Save, Folder, FolderOpen, Smartphone, Volume2, List, UserPlus, Trash2, Users, Edit2, X, Phone, AlertTriangle, Activity, MapPin } from 'lucide-react';
import './App.css';

// --- LEAFLET MARKER FIX ---
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png')
});

const API_URL = "https://redesigned-fiesta-x7967949v6gfvwrg-8000.app.github.dev/";

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

  // Layout & Live Stats States
  const [activeCam, setActiveCam] = useState('CAM-01');
  const [marineData, setMarineData] = useState({ temp: '--', wind: '--', wave: '1.2 m', tide: 'Rising' });

  // Settings & Lifeguard States
  const [settings, setSettings] = useState({
    danger_threshold: 300, min_person_pixels: 100, record_duration: 10, save_directory: "./recordings",
    enable_log: true, enable_sms: false, enable_siren: false, sms_phone_number: "" 
  });
  const [saveStatus, setSaveStatus] = useState("");
  const [lifeguards, setLifeguards] = useState([]);
  
  // Guard State Objects
  const [newGuard, setNewGuard] = useState({ name: "", mobile: "", username: "", password: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [editingUsername, setEditingUsername] = useState(null); 
  const [editGuardData, setEditGuardData] = useState({ name: "", mobile: "", username: "", password: "" });
  const [extraSmsNumber, setExtraSmsNumber] = useState("");

  // Live Weather API Fetch
  useEffect(() => {
    if (isLoggedIn) {
        const fetchWeather = async () => {
            try {
                const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=17.78&longitude=83.37&current=temperature_2m,wind_speed_10m");
                const wData = await res.json();
                if (wData.current) {
                    setMarineData(prev => ({
                        ...prev,
                        temp: `${Math.round(wData.current.temperature_2m)}°C`,
                        wind: `${Math.round(wData.current.wind_speed_10m)} km/h`
                    }));
                }
            } catch (e) { console.error("Weather fetch failed:", e); }
        };
        fetchWeather();
    }
  }, [isLoggedIn]);

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
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.5); 
    } catch (e) { console.error("Audio Error:", e); }
  };

  const checkHardware = () => {
    setIsChecking(true);
    setCheckMessage("");
    setTimeout(() => {
        fetch(`${API_URL}/status`)
        .then(res => res.json())
        .then(result => {
            const anyOnline = result.cameras.some(c => c.status === "online");
            if (anyOnline) { setCameraReady(true); setCheckMessage("SUCCESS: Video Signal Detected."); } 
            else { setCameraReady(false); setCheckMessage("ERROR: All Feeds Offline."); }
            setIsChecking(false);
        })
        .catch(() => { setCameraReady(false); setCheckMessage("CRITICAL: Server Offline."); setIsChecking(false); });
    }, 1500);
  };

  // --- DATABASE LOGIN VERIFICATION WITH ROLES ---
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        if (res.ok) {
            const data = await res.json();
            setUserRole(data.role); 
            setIsLoggedIn(true);
            if (!audioCtxRef.current) { audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)(); }
            audioCtxRef.current.resume(); 
        } else { 
            alert("Invalid Credentials"); 
        }
    } catch (err) {
        alert("Server Error: Cannot reach MongoDB Database");
    }
  };

  // Fetch only this admin's lifeguards on login
  useEffect(() => {
    if (isLoggedIn && userRole === 'admin') {
        fetch(`${API_URL}/settings`).then(res => res.json()).then(data => { setSettings(prev => ({ ...prev, ...data, sms_phone_number: data.sms_phone_number || "" })); });
        fetch(`${API_URL}/lifeguards?admin_id=${username}`)
          .then(res => res.json())
          .then(data => setLifeguards(data));
    }
  }, [isLoggedIn, username, userRole]);

  const toggleLifeguardSms = (mobile) => {
      const currentVal = settings.sms_phone_number || "";
      let numbers = currentVal.split(',').map(s => s.trim()).filter(s => s);
      if (numbers.includes(mobile)) numbers = numbers.filter(n => n !== mobile);
      else numbers.push(mobile);
      setSettings({...settings, sms_phone_number: numbers.join(', ')});
  };

  const updateExtraNumber = (val) => { setExtraSmsNumber(val); };

  const handleSaveSettings = () => {
    setSaveStatus("Saving...");
    
    let currentNumbers = (settings.sms_phone_number || "").split(',').map(s => s.trim()).filter(s => s);
    let validLifeguardNumbers = lifeguards.map(g => g.mobile);
    
    let cleanedNumbers = currentNumbers.filter(num => validLifeguardNumbers.includes(num));

    if (extraSmsNumber && extraSmsNumber.trim() !== "") {
        if (!cleanedNumbers.includes(extraSmsNumber.trim())) {
            cleanedNumbers.push(extraSmsNumber.trim());
        }
    }

    const payload = { ...settings, sms_phone_number: cleanedNumbers.join(', ') };

    fetch(`${API_URL}/settings`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
    })
    .then(async (res) => { 
        if (!res.ok) throw new Error("Save Failed"); 
        return res.json(); 
    })
    .then((savedData) => {
        if (savedData && savedData.settings) {
            setSettings(prev => ({ ...prev, ...savedData.settings, sms_phone_number: savedData.settings.sms_phone_number || "" }));
            setSaveStatus("Saved Successfully!"); 
        }
        setTimeout(() => setSaveStatus(""), 2000); 
    }).catch(() => { 
        setSaveStatus("Error Saving!"); 
        setTimeout(() => setSaveStatus(""), 2000); 
    });
  };

  const handleBrowse = () => { fetch(`${API_URL}/browse`).then(res => res.json()).then(data => { if (data.path) setSettings(prev => ({ ...prev, save_directory: data.path })); }); };
  
  // Create Lifeguard
  const handleAddLifeguard = () => {
    if(!newGuard.name || !newGuard.username) { alert("Fill all fields"); return; }
    const payload = { ...newGuard, created_by: username }; // Inject admin ID
    
    fetch(`${API_URL}/lifeguards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    .then(res => res.json()).then(data => { 
        setLifeguards(data.lifeguards); 
        setNewGuard({ name: "", mobile: "", username: "", password: "" }); 
    }).catch(err => alert("Error: Duplicate username"));
  };
  
  // Update Lifeguard
  const handleUpdateLifeguard = () => {
    const payload = { ...editGuardData, created_by: username };
    
    fetch(`${API_URL}/lifeguards/${editingUsername}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    .then(res => res.json()).then(data => { 
        setLifeguards(data.lifeguards); 
        setIsEditing(false); 
    });
  };
  
  // Delete Lifeguard
  const handleDeleteLifeguard = (user) => {
    if(window.confirm(`Delete ${user}?`)) {
        fetch(`${API_URL}/lifeguards/${user}?admin_id=${username}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => setLifeguards(data.lifeguards));
    }
  };

  const handleEditClick = (g) => { setIsEditing(true); setEditingUsername(g.username); setEditGuardData({...g}); };
  const cancelEdit = () => { setIsEditing(false); setEditingUsername(null); setEditGuardData({ name: "", mobile: "", username: "", password: "" }); };

  // --- MAIN POLLING LOOP ---
  useEffect(() => {
    if (isLoggedIn && (currentView === 'dashboard' || currentView === 'cameras')) {
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
          });
      }, 500); 
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, currentView, settings.enable_log, settings.enable_siren]);

  const addNotification = (msg, type) => { setNotifications(prev => [{ id: Date.now(), time: new Date().toLocaleTimeString(), msg: msg, type: type }, ...prev].slice(0, 50)); };

  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="login-header"> <Shield size={40} className="text-cyan-400" /> <h1>H2O <span className="text-sm opacity-50">ACCESS CONTROL</span></h1> </div>
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

  // Calculate Real-Time Global Stats
  const globalDetected = data.cameras.reduce((sum, cam) => sum + (cam.people_count || 0), 0);
  const globalDanger = data.cameras.reduce((sum, cam) => sum + (cam.danger_count || 0), 0);
  const globalSafe = Math.max(0, globalDetected - globalDanger);

  return (
    <div className="dashboard-container">
      <div className="sidebar">
        <div className="brand"><Shield size={24} /> H2O</div>
        <div className="nav-buttons">
            <button className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentView('dashboard')}> <LayoutDashboard size={16}/> Dashboard </button>
            <button className={`nav-btn ${currentView === 'cameras' ? 'active' : ''}`} onClick={() => setCurrentView('cameras')}> <Video size={16}/> Cameras </button>
            <button className={`nav-btn ${currentView === 'settings' ? 'active' : ''}`} onClick={() => setCurrentView('settings')}> <Settings size={16}/> Settings </button>
            
            {/* Conditional Rendering: Only Admin sees Lifeguards menu */}
            {userRole === 'admin' && (
                <button className={`nav-btn ${currentView === 'lifeguards' ? 'active' : ''}`} onClick={() => setCurrentView('lifeguards')}> <Users size={16}/> Lifeguards </button>
            )}

        </div>
        <button className="logout-btn" onClick={() => {setIsLoggedIn(false); setUsername(''); setPassword(''); setUserRole(null);}}><LogOut size={20} /> LOGOUT</button>
      </div>

      <div className="main-content-area">
        
        {/* --- 1. DASHBOARD VIEW (Map & Global Analytics) --- */}
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

        {/* --- 2. CAMERAS VIEW (Command Center Layout) --- */}
        {currentView === 'cameras' && (
            <div className="cameras-layout">
                
                {/* LEFT COLUMN: Video Feeds */}
                <div className="cameras-left">
                    
                    {/* HERO CAMERA */}
                    <div className="hero-cam-container">
                        <div className="hero-header">
                            <span className="hero-cam-title">LIVE CAMERA FEED - {activeCam}</span>
                            {activeCamData.status === 'online' ? <span className="badge online" style={{background: 'rgba(0,0,0,0.5)'}}>● LIVE</span> : <span className="badge offline">● LOST</span>}
                        </div>
                        
                        {/* Intelligent Overlays */}
                        <div className="hero-overlays">
                            <div className="hero-date-weather">
                                <div className="overlay-box" style={{display:'flex', flexDirection:'column', padding: '8px 12px'}}>
                                    <span style={{fontWeight:'800', fontSize: '0.85rem'}}>{new Date().toLocaleTimeString()}</span>
                                    <small style={{fontSize: '0.65rem'}}>{new Date().toLocaleDateString()}</small>
                                </div>
                                <div className="overlay-box" style={{display:'flex', alignItems:'center', gap:'10px', padding: '8px 12px'}}>
                                    <span style={{fontSize:'1rem', fontWeight: '800'}}>{marineData.temp}</span>
                                    <small style={{opacity: 0.8, fontSize: '0.7rem'}}>Partly Cloudy</small>
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
                            {activeCamData.status === 'online' ? 
                                <img src={`${API_URL}/video_feed/${activeCam}`} className="grid-feed" alt={activeCam} /> 
                            : 
                                <div className="offline-placeholder"><WifiOff size={40}/> NO SIGNAL</div>
                            } 
                        </div>
                    </div>

                    {/* CAMERA CAROUSEL */}
                    <div className="cam-carousel">
                        {data.cameras.map(cam => (
                            <div key={cam.id} className={`carousel-item ${activeCam === cam.id ? 'active-cam' : ''} ${cam.has_threat ? 'danger-border' : ''}`} onClick={() => setActiveCam(cam.id)}>
                                <div className="carousel-vid">
                                    {cam.status === 'online' ? 
                                        <img src={`${API_URL}/video_feed/${cam.id}`} alt={cam.id} /> 
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

                {/* RIGHT COLUMN: Telemetry & Analytics */}
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

                    <div className="side-panel-card">
                        <h4 className="panel-title">Tide & Sea Conditions</h4>
                        <div className="marine-grid">
                            <div className="marine-item"><small>Location</small><span>Visakhapatnam</span></div>
                            <div className="marine-item"><small>Tide</small><span>{marineData.tide}</span></div>
                            <div className="marine-item"><small>Wave Height</small><span>{marineData.wave}</span></div>
                            <div className="marine-item"><small>Wind Speed</small><span>{marineData.wind}</span></div>
                        </div>
                    </div>

                </div>

            </div>
        )}

        {/* --- 3. SETTINGS VIEW --- */}
        {currentView === 'settings' && (
            <div className="settings-container">
                <h2><Settings size={28}/> System Configuration</h2>
                <div className="settings-layout" style={{ gridTemplateColumns: '0.6fr' }}>
                    <div className="settings-column">
                        <div className="settings-card">
                            <h3 className="section-header">System Parameters</h3>
                            <div className="setting-group">
                                <label>Alert Preferences</label>
                                <div className="checkbox-row"> <input type="checkbox" checked={settings.enable_log} onChange={(e) => setSettings({...settings, enable_log: e.target.checked})}/> <span><List size={16} style={{display:'inline'}}/> Activity Log Notification</span> </div>
                                <div className="checkbox-row"> <input type="checkbox" checked={settings.enable_siren} onChange={(e) => setSettings({...settings, enable_siren: e.target.checked})}/> <span><Volume2 size={16} style={{display:'inline'}}/> Audio Siren</span> </div>
                                <div className="checkbox-row" style={{marginBottom: settings.enable_sms ? '5px' : '10px'}}> <input type="checkbox" checked={settings.enable_sms} onChange={(e) => setSettings({...settings, enable_sms: e.target.checked})}/> <span><Smartphone size={16} style={{display:'inline'}}/> WhatsApp Notification</span> </div>
                                {settings.enable_sms && (
                                    <div className="sms-options-panel">
                                        <div style={{fontSize:'0.85rem', color:'#94a3b8', marginBottom:'10px'}}>Notify these lifeguards:</div>
                                        <div className="sms-list-container">
                                            {lifeguards.length === 0 && <div style={{fontSize:'0.8rem', fontStyle:'italic', color:'#64748b'}}>No staff registered.</div>}
                                            {lifeguards.map((guard) => (
                                                <label key={guard.username} className="sms-contact-row">
                                                    <input type="checkbox" checked={(settings.sms_phone_number || "").includes(guard.mobile)} onChange={() => toggleLifeguardSms(guard.mobile)} />
                                                    <span>{guard.name} <small style={{opacity:0.6}}>({guard.mobile})</small></span>
                                                </label>
                                            ))}
                                        </div>
                                        <div style={{marginTop:'10px'}}>
                                            <label style={{fontSize:'0.85rem', color:'#38bdf8', marginBottom:'5px', display:'block'}}>Emergency / HQ Number</label>
                                            <div style={{display:'flex', gap:'8px'}}> <Phone size={16} style={{color:'#64748b', marginTop:'10px'}}/> <input type="text" className="text-input" placeholder="+91..." value={extraSmsNumber} onChange={(e) => updateExtraNumber(e.target.value)} /> </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                             <div className="setting-group"> 
                                 <label>Safe Distance Threshold (Pixels)</label> 
                                 <div className="range-wrapper"> 
                                     <input type="range" min="50" max="500" value={settings.danger_threshold} onChange={(e) => setSettings({...settings, danger_threshold: parseInt(e.target.value)})} /> 
                                     <span className="val-box">{settings.danger_threshold} px</span> 
                                 </div> 
                             </div>
                            <div className="setting-group"> <label>Capture Duration (Max 10s)</label> <div className="range-wrapper"> <input type="range" min="1" max="10" value={settings.record_duration} onChange={(e) => setSettings({...settings, record_duration: parseInt(e.target.value)})} /> <span className="val-box">{settings.record_duration} sec</span> </div> </div>
                            <div className="setting-group"> <label><Folder size={16}/> Save Directory</label> <div style={{display:'flex', gap:'10px'}}> <input type="text" className="text-input" value={settings.save_directory} readOnly /> <button className="browse-btn" onClick={handleBrowse}><FolderOpen size={18} /> Select</button> </div> </div>
                            <button className="save-btn" onClick={handleSaveSettings}> <Save size={18}/> {saveStatus || "Apply & Save Settings"} </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* --- 4. LIFEGUARDS VIEW --- */}
        {currentView === 'lifeguards' && userRole === 'admin' && (
            <div className="settings-container">
                <h2><Users size={28}/> Staff Management</h2>
                <div className="settings-layout">
                    <div className="settings-column">
                        
                        <div className="settings-card">
                            <h3 className="section-header"><UserPlus size={18}/> Register New Lifeguard</h3>
                            <div className="add-guard-form">
                                <input type="text" placeholder="Full Name" className="text-input" value={newGuard.name} onChange={e => setNewGuard({...newGuard, name: e.target.value})}/>
                                <input type="text" placeholder="Mobile Number" className="text-input" value={newGuard.mobile} onChange={e => setNewGuard({...newGuard, mobile: e.target.value})}/>
                                <div style={{display:'flex', gap:'10px'}}>
                                    <input type="text" placeholder="Username (ID)" className="text-input" style={{flex:1}} value={newGuard.username} onChange={e => setNewGuard({...newGuard, username: e.target.value})}/>
                                    <input type="text" placeholder="Password" className="text-input" style={{flex:1}} value={newGuard.password} onChange={e => setNewGuard({...newGuard, password: e.target.value})}/>
                                </div>
                                <button className="add-btn" onClick={handleAddLifeguard}> <Save size={18}/> Save Credentials </button>
                            </div>
                        </div>

                        {isEditing && (
                            <div className="settings-card" style={{marginTop:'20px', border: '2px solid #f59e0b', animation: 'flashBorder 1s'}}>
                                <h3 className="section-header" style={{color: '#f59e0b'}}> <Edit2 size={18}/> Update Lifeguard Details </h3>
                                <div className="add-guard-form">
                                    <input type="text" placeholder="Full Name" className="text-input" value={editGuardData.name} onChange={e => setEditGuardData({...editGuardData, name: e.target.value})}/>
                                    <input type="text" placeholder="Mobile Number" className="text-input" value={editGuardData.mobile} onChange={e => setEditGuardData({...editGuardData, mobile: e.target.value})}/>
                                    <div style={{display:'flex', gap:'10px'}}>
                                        <input type="text" placeholder="Username (ID)" className="text-input" style={{flex:1}} value={editGuardData.username} onChange={e => setEditGuardData({...editGuardData, username: e.target.value})}/>
                                        <input type="text" placeholder="Password" className="text-input" style={{flex:1}} value={editGuardData.password} onChange={e => setEditGuardData({...editGuardData, password: e.target.value})}/>
                                    </div>
                                    <div style={{display:'flex', gap:'10px'}}>
                                        <button className="cancel-btn" onClick={cancelEdit} title="Cancel Editing"> <X size={18}/> Cancel </button>
                                        <button className="add-btn update-mode" onClick={handleUpdateLifeguard} style={{flex:1}}> <Save size={18}/> Update Details </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="settings-column" style={{flex:1, minHeight:'300px'}}>
                        <div className="settings-card full-height-card">
                            <h3 className="section-header"><Users size={18}/> Active Staff Directory</h3>
                            <div className="guard-list">
                                {lifeguards.length === 0 && <div className="no-data">None lifeguards registered.</div>}
                                {lifeguards.map((guard, idx) => (
                                    <div key={idx} className="guard-item" style={isEditing && editingUsername === guard.username ? {border:'1px solid #f59e0b', background: '#262626'} : {}}>
                                        <div className="guard-info"> <span className="g-name">{guard.name}</span> <span className="g-meta">{guard.mobile}</span> <span className="g-meta" style={{color:'#38bdf8'}}>@{guard.username}</span> </div>
                                        <div style={{display:'flex', gap:'8px'}}>
                                            <button className="edit-btn" onClick={() => handleEditClick(guard)} title="Edit Details"> <Edit2 size={16}/> </button>
                                            <button className="del-btn" onClick={() => handleDeleteLifeguard(guard.username)} title="Remove Access"> <Trash2 size={16}/> </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
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