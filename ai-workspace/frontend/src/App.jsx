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

  // Phase 4 State (Chat)
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isChatting, setIsChatting] = useState(false);

  useEffect(() => {
    if (user) fetchProjects();
  }, [user]);

  // Poll for document status updates every 5 seconds if viewing a project
  useEffect(() => {
    let interval;
    if (activeProject) {
      fetchDocuments(activeProject.id);
      interval = setInterval(() => fetchDocuments(activeProject.id), 5000);
      // Reset chat history when switching projects
      setChatHistory([]); 
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

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || !activeProject) return;
  
    // Optimistically add user message and an empty AI response slot
    const newHistory = [...chatHistory, { role: 'user', content: chatMessage }, { role: 'ai', content: '' }];
    setChatHistory(newHistory);
    setChatMessage('');
    setIsChatting(true);
  
    try {
      const res = await fetch(`http://localhost:8000/api/projects/${activeProject.id}/chat/`, {
        ...jsonFetchOptions,
        method: 'POST',
        body: JSON.stringify({ message: chatMessage }),
      });
  
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let aiResponse = "";
  
      // Read the stream chunk-by-chunk
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        aiResponse += chunk;
        
        // Update the last message in history with the new chunks
        setChatHistory(prev => {
          const updated = [...prev];
          updated[updated.length - 1].content = aiResponse;
          return updated;
        });
      }
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsChatting(false);
    }
  };

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(135deg,#667eea,#764ba2)', fontFamily: 'system-ui' }}>
        <div style={{ width: '420px', background: '#fff', padding: '40px', borderRadius: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
          <h1 style={{ textAlign: 'center' }}>🤖 AI Research Workspace</h1>
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
          style={{ marginBottom: '20px', padding: '10px 20px', borderRadius: '8px', border: '1px solid #ccc', cursor: 'pointer', background: '#fff' }}
        >
          &larr; Back to Dashboard
        </button>
        
        <div style={{ display: 'flex', gap: '20px' }}>
          {/* Left Column: Documents & Upload */}
          <div style={{ flex: 1, background: '#fff', padding: '25px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.08)' }}>
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
                  <li key={doc.id} style={{ borderBottom: '1px solid #eee', padding: '15px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>📄 {doc.title}</span>
                    <span style={{ 
                      padding: '4px 12px', borderRadius: '12px', fontSize: '14px', fontWeight: 'bold',
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

          {/* Right Column: AI Chat Component */}
          <div style={{ flex: 1, background: '#fff', padding: '25px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
            <h2>💬 Chat with Documents</h2>
            
            <div style={{ flex: 1, overflowY: 'auto', minHeight: '400px', maxHeight: '500px', marginBottom: '15px', padding: '15px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
              {chatHistory.length === 0 ? (
                <p style={{ color: '#6b7280', fontStyle: 'italic', textAlign: 'center', marginTop: '50px' }}>
                  Upload a document and ask a question to start chatting!
                </p>
              ) : (
                chatHistory.map((msg, idx) => (
                  <div key={idx} style={{ marginBottom: '15px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                    <span style={{ 
                      display: 'inline-block', padding: '12px 16px', borderRadius: '16px',
                      background: msg.role === 'user' ? '#667eea' : '#ffffff',
                      color: msg.role === 'user' ? '#fff' : '#1f2937',
                      border: msg.role === 'ai' ? '1px solid #e5e7eb' : 'none',
                      maxWidth: '85%',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                      lineHeight: '1.5',
                      whiteSpace: 'pre-wrap' // Ensures formatting/newlines from LLM render correctly
                    }}>
                      {msg.content || (msg.role === 'ai' ? '...' : '')}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="text" 
                placeholder="Ask about your documents..." 
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={isChatting}
                style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #ccc', outline: 'none' }} 
              />
              <button 
                onClick={handleSendMessage} 
                disabled={isChatting}
                style={{ padding: '14px 24px', borderRadius: '12px', background: isChatting ? '#9ca3af' : '#667eea', color: '#fff', border: 'none', cursor: isChatting ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
              >
                {isChatting ? 'Thinking...' : 'Send'}
              </button>
            </div>
          </div>
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
              <li key={p.id} onClick={() => setActiveProject(p)} style={{ background: '#eef2ff', padding: '20px', borderRadius: '12px', marginBottom: '12px', cursor: 'pointer', transition: '0.2s', border: '1px solid transparent' }} onMouseOver={e => e.currentTarget.style.border = '1px solid #667eea'} onMouseOut={e => e.currentTarget.style.border = '1px solid transparent'}>
                <h3 style={{ margin: '0 0 8px 0', color: '#374151' }}>📁 {p.name}</h3>
                <small style={{ color: '#6b7280' }}>Team: {p.team__name} &rarr; Click to open</small>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
          <input placeholder="New Project Name" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #ccc', outline: 'none' }} />
          <button onClick={createProject} style={{ padding: '14px 24px', borderRadius: '12px', border: 'none', background: '#667eea', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>+ Create Project</button>
        </div>
      </div>
    </div>
  );
}

export default App;