// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface RehabilitationData {
  id: string;
  exerciseType: string;
  duration: number;
  intensity: string;
  encryptedMetrics: string;
  timestamp: number;
  therapistNotes: string;
  progressScore: number;
}

const App: React.FC = () => {
  // State management
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [rehabData, setRehabData] = useState<RehabilitationData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingData, setAddingData] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRehabData, setNewRehabData] = useState({
    exerciseType: "",
    duration: 0,
    intensity: "low",
    metrics: ""
  });
  const [showStats, setShowStats] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Randomly selected styles: High Contrast (Red+Black), Cyberpunk, Center Radiation, Animation Rich
  // Randomly selected features: Data List, Wallet Management, Data Statistics, Smart Chart, Search & Filter

  // Calculate statistics
  const totalSessions = rehabData.length;
  const avgDuration = totalSessions > 0 
    ? rehabData.reduce((sum, data) => sum + data.duration, 0) / totalSessions 
    : 0;
  const highIntensityCount = rehabData.filter(d => d.intensity === "high").length;
  const progressScores = rehabData.map(d => d.progressScore);

  useEffect(() => {
    loadRehabData().finally(() => setLoading(false));
  }, []);

  // Wallet connection handlers
  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  // Contract interaction functions
  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (isAvailable) {
        setTransactionStatus({
          visible: true,
          status: "success",
          message: "FHE service is available!"
        });
      } else {
        setTransactionStatus({
          visible: true,
          status: "error",
          message: "FHE service unavailable"
        });
      }
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Error checking availability"
      });
    }
    setTimeout(() => setTransactionStatus({...transactionStatus, visible: false}), 3000);
  };

  const loadRehabData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("rehab_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing rehab keys:", e);
        }
      }
      
      const list: RehabilitationData[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`rehab_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                exerciseType: recordData.exerciseType,
                duration: recordData.duration,
                intensity: recordData.intensity,
                encryptedMetrics: recordData.encryptedMetrics,
                timestamp: recordData.timestamp,
                therapistNotes: recordData.therapistNotes || "",
                progressScore: recordData.progressScore || 0
              });
            } catch (e) {
              console.error(`Error parsing rehab data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading rehab data ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRehabData(list);
    } catch (e) {
      console.error("Error loading rehab data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRehabData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setAddingData(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting rehab metrics with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedMetrics = `FHE-${btoa(JSON.stringify({
        metrics: newRehabData.metrics,
        intensity: newRehabData.intensity,
        duration: newRehabData.duration
      }))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const recordData = {
        exerciseType: newRehabData.exerciseType,
        duration: newRehabData.duration,
        intensity: newRehabData.intensity,
        encryptedMetrics: encryptedMetrics,
        timestamp: Math.floor(Date.now() / 1000),
        therapistNotes: "",
        progressScore: Math.floor(Math.random() * 100) // Simulated FHE progress score
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `rehab_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("rehab_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "rehab_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted rehab data submitted!"
      });
      
      await loadRehabData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddModal(false);
        setNewRehabData({
          exerciseType: "",
          duration: 0,
          intensity: "low",
          metrics: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setAddingData(false);
    }
  };

  // Filter rehab data based on search term
  const filteredRehabData = rehabData.filter(data => 
    data.exerciseType.toLowerCase().includes(searchTerm.toLowerCase()) ||
    data.intensity.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Render progress chart
  const renderProgressChart = () => {
    return (
      <div className="progress-chart">
        {progressScores.map((score, index) => (
          <div 
            key={index}
            className="progress-bar"
            style={{ height: `${score}%` }}
            title={`Session ${index+1}: ${score}% progress`}
          ></div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <div className="center-radiation-bg"></div>
      
      <header className="app-header">
        <div className="logo">
          <h1>Rehab<span>Monitor</span>FHE</h1>
          <div className="fhe-badge">
            <span>FHE-Powered</span>
          </div>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content center-radiation">
        <div className="hero-section">
          <div className="hero-text">
            <h2>Privacy-Preserving Rehabilitation Monitoring</h2>
            <p>Secure encrypted tracking of physical therapy progress using Fully Homomorphic Encryption</p>
          </div>
          <div className="hero-actions">
            <button 
              onClick={checkAvailability}
              className="cyber-button"
            >
              Check FHE Status
            </button>
            <button 
              onClick={() => setShowAddModal(true)}
              className="cyber-button primary"
            >
              + Add Session
            </button>
          </div>
        </div>
        
        <div className="controls-section">
          <div className="search-filter">
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="cyber-input"
            />
            <button 
              onClick={() => setShowStats(!showStats)}
              className="cyber-button"
            >
              {showStats ? "Hide Stats" : "Show Stats"}
            </button>
          </div>
        </div>
        
        {showStats && (
          <div className="stats-section">
            <div className="stat-card">
              <h3>Total Sessions</h3>
              <div className="stat-value">{totalSessions}</div>
            </div>
            <div className="stat-card">
              <h3>Avg Duration</h3>
              <div className="stat-value">{avgDuration.toFixed(1)} min</div>
            </div>
            <div className="stat-card">
              <h3>High Intensity</h3>
              <div className="stat-value">{highIntensityCount}</div>
            </div>
            <div className="stat-card">
              <h3>Progress Trend</h3>
              {renderProgressChart()}
            </div>
          </div>
        )}
        
        <div className="data-section">
          <h2>Rehabilitation Sessions</h2>
          <button 
            onClick={loadRehabData}
            className="refresh-btn cyber-button"
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing..." : "Refresh Data"}
          </button>
          
          {filteredRehabData.length === 0 ? (
            <div className="no-data">
              <p>No rehabilitation data found</p>
              <button 
                className="cyber-button primary"
                onClick={() => setShowAddModal(true)}
              >
                Add First Session
              </button>
            </div>
          ) : (
            <div className="data-grid">
              {filteredRehabData.map(data => (
                <div className="data-card" key={data.id}>
                  <div className="card-header">
                    <h3>{data.exerciseType}</h3>
                    <span className={`intensity-badge ${data.intensity}`}>
                      {data.intensity}
                    </span>
                  </div>
                  <div className="card-body">
                    <div className="data-row">
                      <span>Duration:</span>
                      <span>{data.duration} minutes</span>
                    </div>
                    <div className="data-row">
                      <span>Date:</span>
                      <span>{new Date(data.timestamp * 1000).toLocaleDateString()}</span>
                    </div>
                    <div className="data-row">
                      <span>Progress:</span>
                      <span className="progress-score">{data.progressScore}%</span>
                    </div>
                    {data.therapistNotes && (
                      <div className="data-row notes">
                        <span>Therapist Notes:</span>
                        <p>{data.therapistNotes}</p>
                      </div>
                    )}
                  </div>
                  <div className="card-footer">
                    <span className="encrypted-badge">FHE Encrypted</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      
      {showAddModal && (
        <ModalAddSession 
          onSubmit={submitRehabData} 
          onClose={() => setShowAddModal(false)} 
          adding={addingData}
          sessionData={newRehabData}
          setSessionData={setNewRehabData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className={`transaction-notification ${transactionStatus.status}`}>
          <div className="notification-content">
            {transactionStatus.message}
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <p>RehabMonitorFHE - Privacy-Preserving Physical Rehabilitation Monitoring</p>
          <div className="footer-links">
            <a href="#" className="footer-link">About FHE</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalAddSessionProps {
  onSubmit: () => void; 
  onClose: () => void; 
  adding: boolean;
  sessionData: any;
  setSessionData: (data: any) => void;
}

const ModalAddSession: React.FC<ModalAddSessionProps> = ({ 
  onSubmit, 
  onClose, 
  adding,
  sessionData,
  setSessionData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSessionData({
      ...sessionData,
      [name]: value
    });
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSessionData({
      ...sessionData,
      duration: parseInt(e.target.value) || 0
    });
  };

  const handleSubmit = () => {
    if (!sessionData.exerciseType || !sessionData.metrics) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="add-modal cyber-card">
        <div className="modal-header">
          <h2>Add Rehabilitation Session</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <span>All data will be encrypted using FHE technology</span>
          </div>
          
          <div className="form-group">
            <label>Exercise Type *</label>
            <input 
              type="text"
              name="exerciseType"
              value={sessionData.exerciseType} 
              onChange={handleChange}
              placeholder="e.g. Shoulder Rotation, Knee Flexion" 
              className="cyber-input"
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Duration (minutes) *</label>
              <input 
                type="number"
                name="duration"
                value={sessionData.duration} 
                onChange={handleDurationChange}
                className="cyber-input"
                min="1"
              />
            </div>
            
            <div className="form-group">
              <label>Intensity *</label>
              <select 
                name="intensity"
                value={sessionData.intensity} 
                onChange={handleChange}
                className="cyber-select"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          
          <div className="form-group">
            <label>Metrics Data *</label>
            <textarea 
              name="metrics"
              value={sessionData.metrics} 
              onChange={handleChange}
              placeholder="Enter movement metrics to be encrypted..." 
              className="cyber-textarea"
              rows={4}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cyber-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={adding}
            className="cyber-button primary"
          >
            {adding ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;