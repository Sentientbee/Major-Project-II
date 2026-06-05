import React, { useState, useEffect, useRef } from 'react';

const fetchOptions = { credentials: 'include' };
const jsonFetchOptions = { ...fetchOptions, headers: { 'Content-Type': 'application/json' } };

// Phase 5 Pastel Palette
const palette = {
  primary: '#97B3AE',     // Muted Teal (Buttons, Active Tabs)
  secondary: '#D2E0D3',   // Sage Green (AI Bubbles)
  background: '#F0DDD6',  // Warm Dusty Pink (Main App Background)
  warning: '#F2C3B9',     // Peach/Salmon (Errors, Delete Buttons)
  neutral: '#D6CBBF',     // Warm Grey (User Bubbles, Borders)
  surface: '#F0EEEA',     // Off-White (Cards, Modals)
  textDark: '#4A4A4A'     // Soft Dark Grey for text readability
};

function App() {
  const [user, setUser] = useState(null);
  const [newMemberName, setNewMemberName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(''); // Replaces standard alert()

  // Phase 5: Experiment State
  const [promptA, setPromptA] = useState('');
  const [promptB, setPromptB] = useState('');
  const [resA, setResA] = useState('');
  const [resB, setResB] = useState('');
  const [isExperimenting, setIsExperimenting] = useState(false);
    
  const [projects, setProjects] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [activeProject, setActiveProject] = useState(null);
  
  // View State: Separates Document Upload and Chat into distinct windows/tabs
  const [projectWindow, setProjectWindow] = useState('chat'); // 'chat', 'docs', or 'experiment'
  
  const [documents, setDocuments] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (user) fetchProjects();
  }, [user]);

  useEffect(() => {
    let interval;
    if (activeProject) {
      fetchDocuments(activeProject.id);
      fetchChatHistory(activeProject.id); // Fetch previous chats!
      
      // Only poll docs if we are looking at the docs tab to save network calls
      if (projectWindow === 'docs') {
        interval = setInterval(() => fetchDocuments(activeProject.id), 5000);
      }
    }
    return () => clearInterval(interval);
  }, [activeProject, projectWindow]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const fetchProjects = async () => {
    const res = await fetch('http://localhost:8000/api/projects/', jsonFetchOptions);
    if (res.ok) setProjects(await res.json());
  };

  const fetchDocuments = async (projectId) => {
    const res = await fetch(`http://localhost:8000/api/projects/${projectId}/documents/`, jsonFetchOptions);
    if (res.ok) setDocuments(await res.json());
  };

  const fetchChatHistory = async (projectId) => {
    const res = await fetch(`http://localhost:8000/api/projects/${projectId}/chat/history/`, jsonFetchOptions);
    if (res.ok) {
      const history = await res.json();
      setChatHistory(history);
    }
  };

  const handleAuth = async (endpoint) => {
    setAuthError('');
    const res = await fetch(`http://localhost:8000/api/${endpoint}/`, {
      ...jsonFetchOptions,
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      const data = await res.json();
      setUser(data.username);
    } else {
      setAuthError(endpoint === 'login' ? 'Incorrect username or password.' : 'Signup failed. User might exist.');
    }
  };

  const createProject = async () => {
    if (!newProjectName.trim()) return;
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

  const deleteProject = async (projectId, e) => {
    e.stopPropagation(); // Prevent opening the project when clicking delete
    const res = await fetch(`http://localhost:8000/api/projects/${projectId}/delete/`, {
      ...fetchOptions, method: 'DELETE'
    });
    if (res.ok) fetchProjects();
  };

  const handleFileUpload = async () => {
    if (!selectedFile || !activeProject) return;
    const formData = new FormData();
    formData.append('file', selectedFile);

    const res = await fetch(`http://localhost:8000/api/projects/${activeProject.id}/documents/`, {
      ...fetchOptions, method: 'POST', body: formData,
    });
    if (res.ok) {
      setSelectedFile(null);
      fetchDocuments(activeProject.id);
    }
  };

  const deleteDocument = async (docId) => {
    const res = await fetch(`http://localhost:8000/api/projects/${activeProject.id}/documents/${docId}/delete/`, {
      ...fetchOptions, method: 'DELETE'
    });
    if (res.ok) fetchDocuments(activeProject.id);
  };

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || !activeProject) return;
    const newHistory = [...chatHistory, { role: 'user', content: chatMessage }, { role: 'ai', content: '' }];
    setChatHistory(newHistory);
    setChatMessage('');
    setIsChatting(true);
  
    try {
      const res = await fetch(`http://localhost:8000/api/projects/${activeProject.id}/chat/`, {
        ...jsonFetchOptions, method: 'POST', body: JSON.stringify({ message: chatMessage }),
      });
  
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let aiResponse = "";
  
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        aiResponse += decoder.decode(value, { stream: true });
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

  const addTeamMember = async () => {
    if (!newMemberName.trim() || !activeProject) return;
    const res = await fetch(`http://localhost:8000/api/projects/${activeProject.id}/team/add/`, {
      ...jsonFetchOptions, method: 'POST', body: JSON.stringify({ username: newMemberName })
    });
    if (res.ok) {
      alert(`Added ${newMemberName} to the project!`); // Simple confirmation
      setNewMemberName('');
    } else {
      alert('Failed to add member. Ensure the username exists.');
    }
  };

  const runExperiment = async () => {
    if (!promptA.trim() || !promptB.trim() || !activeProject) return;
    setIsExperimenting(true);
    setResA('Thinking...');
    setResB('Thinking...');

    // Helper function to hit the chat endpoint and return the full text
    const fetchResponse = async (message) => {
      const res = await fetch(`http://localhost:8000/api/projects/${activeProject.id}/chat/`, {
        ...jsonFetchOptions, method: 'POST', body: JSON.stringify({ message })
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }
      return fullText;
    };

    // Run both calls concurrently
    const [outA, outB] = await Promise.all([fetchResponse(promptA), fetchResponse(promptB)]);
    setResA(outA);
    setResB(outB);
    setIsExperimenting(false);
  };

  const saveEvaluation = async (winner) => {
    const res = await fetch(`http://localhost:8000/api/projects/${activeProject.id}/evaluate/`, {
      ...jsonFetchOptions, method: 'POST', body: JSON.stringify({
        prompt_a: promptA, prompt_b: promptB, response_a: resA, response_b: resB, winner
      })
    });
    if (res.ok) alert(`Saved! Prompt ${winner} was marked as better.`);
  };


  // --- STYLES ---
  const containerStyle = { minHeight: '100vh', background: palette.background, padding: '40px', fontFamily: 'system-ui', color: palette.textDark };
  const cardStyle = { background: palette.surface, padding: '30px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' };
  const inputStyle = { width: '100%', padding: '14px', borderRadius: '8px', border: `1px solid ${palette.neutral}`, outline: 'none', boxSizing: 'border-box' };
  const btnStyle = { padding: '14px 24px', borderRadius: '8px', border: 'none', background: palette.primary, color: '#fff', cursor: 'pointer', fontWeight: 'bold' };

  // --- LOGIN VIEW ---
  if (!user) {
    return (
      <div style={{ ...containerStyle, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ ...cardStyle, width: '400px' }}>
          <h1 style={{ textAlign: 'center', color: palette.primary, marginBottom: '10px' }}>AI Workspace</h1>
          <p style={{ textAlign: 'center', color: palette.textDark, marginBottom: '30px' }}>Sign in to continue</p>
          
          {authError && (
            <div style={{ background: palette.warning, color: palette.textDark, padding: '12px', borderRadius: '8px', marginBottom: '15px', textAlign: 'center' }}>
              {authError}
            </div>
          )}

          <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} style={{ ...inputStyle, marginBottom: '15px' }} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inputStyle, marginBottom: '20px' }} />
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => handleAuth('login')} style={{ ...btnStyle, flex: 1 }}>Login</button>
            <button onClick={() => handleAuth('signup')} style={{ ...btnStyle, flex: 1, background: palette.neutral, color: palette.textDark }}>Sign Up</button>
          </div>
        </div>
      </div>
    );
  }

  // --- PROJECT DETAIL VIEW (Separated Windows) ---
  if (activeProject) {
    return (
      <div style={containerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <button onClick={() => setActiveProject(null)} style={{ ...btnStyle, background: palette.neutral, color: palette.textDark }}>
              Back to Dashboard
            </button>
            <h2 style={{ margin: 0 }}>{activeProject.name}</h2>
          </div>
          
          {/* Team Member Input */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <input 
              placeholder="Username to add..." 
              value={newMemberName} 
              onChange={e => setNewMemberName(e.target.value)} 
              style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${palette.neutral}`, outline: 'none' }}
            />
            <button onClick={addTeamMember} style={{ ...btnStyle, padding: '10px 16px' }}>
              + Invite
            </button>
          </div>
        </div>
        
        <div style={cardStyle}>
          {/* Custom Tab Navigation (Updated with 3rd Tab) */}
          <div style={{ display: 'flex', gap: '10px', borderBottom: `2px solid ${palette.neutral}`, paddingBottom: '15px', marginBottom: '20px' }}>
            <button onClick={() => setProjectWindow('chat')} style={{ ...btnStyle, background: projectWindow === 'chat' ? palette.primary : 'transparent', color: projectWindow === 'chat' ? '#fff' : palette.textDark, border: projectWindow === 'chat' ? 'none' : `1px solid ${palette.neutral}` }}>Research Chat</button>
            <button onClick={() => setProjectWindow('docs')} style={{ ...btnStyle, background: projectWindow === 'docs' ? palette.primary : 'transparent', color: projectWindow === 'docs' ? '#fff' : palette.textDark, border: projectWindow === 'docs' ? 'none' : `1px solid ${palette.neutral}` }}>Document Management</button>
            <button onClick={() => setProjectWindow('experiment')} style={{ ...btnStyle, background: projectWindow === 'experiment' ? palette.primary : 'transparent', color: projectWindow === 'experiment' ? '#fff' : palette.textDark, border: projectWindow === 'experiment' ? 'none' : `1px solid ${palette.neutral}` }}>A/B Experiment</button>
          </div>

          {/* VIEW: CHAT */}
          {projectWindow === 'chat' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '60vh' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#fff', borderRadius: '12px', border: `1px solid ${palette.neutral}`, marginBottom: '15px' }}>
                {chatHistory.length === 0 ? (
                  <p style={{ color: palette.textDark, textAlign: 'center', marginTop: '50px', fontStyle: 'italic' }}>
                    Send a message to start researching.
                  </p>
                ) : (
                  chatHistory.map((msg, idx) => (
                    <div key={idx} style={{ marginBottom: '15px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                      <span style={{ 
                        display: 'inline-block', padding: '14px 18px', borderRadius: '16px',
                        background: msg.role === 'user' ? palette.neutral : palette.secondary,
                        color: palette.textDark, maxWidth: '80%', lineHeight: '1.5', whiteSpace: 'pre-wrap'
                      }}>
                        {msg.content || (msg.role === 'ai' ? '...' : '')}
                      </span>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" placeholder="Ask about your documents or search the web..." 
                  value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  disabled={isChatting} style={{ ...inputStyle, flex: 1 }} 
                />
                <button onClick={handleSendMessage} disabled={isChatting} style={{ ...btnStyle, background: isChatting ? palette.neutral : palette.primary }}>
                  {isChatting ? 'Thinking...' : 'Send'}
                </button>
              </div>
            </div>
          )}

          {/* VIEW: DOCUMENTS */}
          {projectWindow === 'docs' && (
            <div>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: `1px solid ${palette.neutral}`, marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input type="file" accept=".pdf" onChange={(e) => setSelectedFile(e.target.files[0])} style={{ flex: 1 }} />
                <button onClick={handleFileUpload} style={btnStyle}>Upload & Process</button>
              </div>

              <h3>Project Knowledge Base</h3>
              {documents.length === 0 ? <p>No documents uploaded yet.</p> : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {documents.map((doc) => (
                    <li key={doc.id} style={{ border: `1px solid ${palette.neutral}`, background: '#fff', borderRadius: '8px', padding: '15px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{doc.title}</span>
                      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <span style={{ fontSize: '14px', fontWeight: 'bold', color: doc.status === 'Ready' ? '#4caf50' : palette.textDark }}>
                          {doc.status}
                        </span>
                        <button onClick={() => deleteDocument(doc.id)} style={{ padding: '6px 12px', background: palette.warning, color: palette.textDark, border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* VIEW: EXPERIMENT */}
          {projectWindow === 'experiment' && (
            <div>
              <h3 style={{ marginTop: 0 }}>Compare Prompts Side-by-Side</h3>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                
                {/* Side A */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <textarea 
                    placeholder="Prompt A (e.g., 'Summarize this formally')" 
                    value={promptA} onChange={(e) => setPromptA(e.target.value)} 
                    style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} 
                  />
                  <div style={{ flex: 1, minHeight: '200px', background: '#fff', border: `1px solid ${palette.neutral}`, borderRadius: '8px', padding: '15px', whiteSpace: 'pre-wrap' }}>
                    <strong>Output A:</strong><br/><br/>{resA}
                  </div>
                  {resA && resA !== 'Thinking...' && (
                    <button onClick={() => saveEvaluation('A')} style={{ ...btnStyle, background: palette.secondary, color: palette.textDark }}>
                      🏆 Prompt A is Better
                    </button>
                  )}
                </div>

                {/* Side B */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <textarea 
                    placeholder="Prompt B (e.g., 'Explain this like I am 5')" 
                    value={promptB} onChange={(e) => setPromptB(e.target.value)} 
                    style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} 
                  />
                  <div style={{ flex: 1, minHeight: '200px', background: '#fff', border: `1px solid ${palette.neutral}`, borderRadius: '8px', padding: '15px', whiteSpace: 'pre-wrap' }}>
                    <strong>Output B:</strong><br/><br/>{resB}
                  </div>
                  {resB && resB !== 'Thinking...' && (
                    <button onClick={() => saveEvaluation('B')} style={{ ...btnStyle, background: palette.secondary, color: palette.textDark }}>
                      🏆 Prompt B is Better
                    </button>
                  )}
                </div>

              </div>
              
              <div style={{ textAlign: 'center' }}>
                <button onClick={runExperiment} disabled={isExperimenting} style={{ ...btnStyle, padding: '15px 40px', fontSize: '16px' }}>
                  {isExperimenting ? 'Running Evaluation...' : 'Run Experiment 🚀'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }

  // --- DASHBOARD VIEW ---
  return (
    <div style={containerStyle}>
      <div style={{ ...cardStyle, marginBottom: '30px', background: palette.primary, color: '#fff' }}>
        <h1 style={{ margin: 0 }}>Welcome, {user}</h1>
        <p style={{ margin: '10px 0 0 0', opacity: 0.9 }}>Manage your workspaces</p>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
          <input placeholder="New Project Name" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <button onClick={createProject} style={btnStyle}>Create Project</button>
        </div>

        <h3>Your Workspaces</h3>
        {projects.length === 0 ? <p>No projects found.</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {projects.map((p) => (
              <div key={p.id} onClick={() => setActiveProject(p)} style={{ border: `1px solid ${palette.neutral}`, background: '#fff', padding: '20px', borderRadius: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: '0 0 8px 0', color: palette.primary }}>{p.name}</h3>
                  <p style={{ color: palette.textDark, fontSize: '14px', margin: 0 }}>Team: {p.team__name}</p>
                </div>
                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={(e) => deleteProject(p.id, e)} style={{ padding: '8px 16px', background: palette.warning, color: palette.textDark, border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                    Delete Project
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;