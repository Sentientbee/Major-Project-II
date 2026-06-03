import React, { useState, useEffect } from 'react';

const fetchOptions = {
  credentials: 'include', // Needed for session cookies
};

const jsonFetchOptions = {
  ...fetchOptions,
  headers: { 'Content-Type': 'application/json' },
};

function App() {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [projects, setProjects] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');
  
  // Phase 3 State
  const [activeProject, setActiveProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    if (user) fetchProjects();
  }, [user]);

  // Poll for document status updates every 5 seconds if viewing a project
  useEffect(() => {
    let interval;
    if (activeProject) {
      fetchDocuments(activeProject.id);
      interval = setInterval(() => fetchDocuments(activeProject.id), 5000);
    }
    return () => clearInterval(interval);
  }, [activeProject]);

  const fetchProjects = async () => {
    const res = await fetch('http://localhost:8000/api/projects/', jsonFetchOptions);
    if (res.ok) setProjects(await res.json());
  };

  const fetchDocuments = async (projectId) => {
    const res = await fetch(`http://localhost:8000/api/projects/${projectId}/documents/`, jsonFetchOptions);
    if (res.ok) setDocuments(await res.json());
  };

  const handleAuth = async (endpoint) => {
    const res = await fetch(`http://localhost:8000/api/${endpoint}/`, {
      ...jsonFetchOptions,
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      const data = await res.json();
      setUser(data.username);
    } else {
      alert('Authentication failed');
    }
  };

  const createProject = async () => {
    const res = await fetch('http://localhost:8000/api/projects/', {
      ...jsonFetchOptions,
      method: 'POST',
      body: JSON.stringify({ name: newProjectName }),
    });

    if (res.ok) {
      setNewProjectName('');
      fetchProjects();
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile || !activeProject) return;

    const formData = new FormData();
    formData.append('file', selectedFile);

    const res = await fetch(`http://localhost:8000/api/projects/${activeProject.id}/documents/`, {
      ...fetchOptions, // DO NOT set Content-Type header here; browser sets it with boundaries for FormData
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      setSelectedFile(null);
      fetchDocuments(activeProject.id);
    } else {
      alert('Upload failed');
    }
  };

  if (!user) {
    // ... (Your friend's Login UI remains exactly the same)
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(135deg,#667eea,#764ba2)', fontFamily: 'system-ui' }}>
        <div style={{ width: '420px', background: '#fff', padding: '40px', borderRadius: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
          <h1 style={{ textAlign: 'center' }}>🚀 AI Research Workspace</h1>
          <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: '100%', padding: '14px', marginTop: '20px', borderRadius: '12px', boxSizing: 'border-box' }} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: '14px', marginTop: '15px', borderRadius: '12px', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button onClick={() => handleAuth('login')} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: '#667eea', color: '#fff', cursor: 'pointer' }}>Login</button>
            <button onClick={() => handleAuth('signup')} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: '#764ba2', color: '#fff', cursor: 'pointer' }}>Sign Up</button>
          </div>
        </div>
      </div>
    );
  }

  // --- PROJECT DETAIL VIEW ---
  if (activeProject) {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f7fc', padding: '40px', fontFamily: 'system-ui' }}>
        <button 
          onClick={() => setActiveProject(null)} 
          style={{ marginBottom: '20px', padding: '10px 20px', borderRadius: '8px', border: '1px solid #ccc', cursor: 'pointer' }}
        >
          &larr; Back to Dashboard
        </button>
        
        <div style={{ background: '#fff', padding: '25px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.08)' }}>
          <h2>📁 {activeProject.name} Workspace</h2>
          
          <div style={{ background: '#eef2ff', padding: '20px', borderRadius: '12px', marginTop: '20px' }}>
            <h3>Upload Knowledge (PDF)</h3>
            <input type="file" accept=".pdf" onChange={(e) => setSelectedFile(e.target.files[0])} />
            <button onClick={handleFileUpload} style={{ padding: '10px 20px', borderRadius: '8px', background: '#667eea', color: '#fff', border: 'none', cursor: 'pointer', marginLeft: '10px' }}>
              Upload & Process
            </button>
          </div>

          <h3 style={{ marginTop: '30px' }}>Documents</h3>
          {documents.length === 0 ? <p>No documents uploaded yet.</p> : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {documents.map((doc) => (
                <li key={doc.id} style={{ borderBottom: '1px solid #eee', padding: '15px 0', display: 'flex', justifyContent: 'space-between' }}>
                  <span>📄 {doc.title}</span>
                  <span style={{ 
                    padding: '4px 12px', borderRadius: '12px', fontSize: '14px',
                    background: doc.status === 'Ready' ? '#d1fae5' : doc.status === 'Failed' ? '#fee2e2' : '#fef3c7',
                    color: doc.status === 'Ready' ? '#065f46' : doc.status === 'Failed' ? '#991b1b' : '#92400e'
                  }}>
                    {doc.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // --- DASHBOARD VIEW ---
  return (
    <div style={{ minHeight: '100vh', background: '#f4f7fc', padding: '40px', fontFamily: 'system-ui' }}>
      <div style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)', color: '#fff', padding: '30px', borderRadius: '24px', marginBottom: '25px' }}>
        <h1>👋 Welcome, {user}</h1>
        <p>Manage your AI projects efficiently</p>
      </div>

      <div style={{ background: '#fff', padding: '25px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.08)' }}>
        <h2>Your Workspaces</h2>
        {projects.length === 0 ? <p>No projects found. Create one below!</p> : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {projects.map((p) => (
              <li key={p.id} onClick={() => setActiveProject(p)} style={{ background: '#eef2ff', padding: '15px', borderRadius: '12px', marginBottom: '12px', cursor: 'pointer', transition: '0.2s' }}>
                <h3 style={{ margin: '0 0 5px 0' }}>📁 {p.name}</h3>
                <small>Team: {p.team__name} &rarr; Click to open</small>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <input placeholder="New Project Name" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #ccc' }} />
          <button onClick={createProject} style={{ padding: '14px 20px', borderRadius: '12px', border: 'none', background: '#667eea', color: '#fff', cursor: 'pointer' }}>➕ Create</button>
        </div>
      </div>
    </div>
  );
}

export default App;
