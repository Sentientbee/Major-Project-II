import React, { useState, useEffect, useRef } from 'react';

const fetchOptions = { credentials: 'include' };
const jsonFetchOptions = { ...fetchOptions, headers: { 'Content-Type': 'application/json' } };

// Phase 5 Pastel Palette
const palette = {
  primary: '#97B3AE',
  secondary: '#D2E0D3',
  background: '#F0DDD6',
  warning: '#F2C3B9',
  neutral: '#D6CBBF',
  surface: '#F0EEEA',
  textDark: '#4A4A4A',
  sidebarBg: '#E8E0D8',
  sidebarActive: '#97B3AE',
  sidebarHover: '#DDD6CE',
  chartBar: '#7A9A95' 
};

function App() {
  const [user, setUser] = useState(null);
  const [newMemberName, setNewMemberName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [projects, setProjects] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [activeProject, setActiveProject] = useState(null);

  const [projectWindow, setProjectWindow] = useState('chat');
  const [documents, setDocuments] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  // --- Multi-tab chat state ---
  const [chatSessions, setChatSessions] = useState([]);      
  const [activeSession, setActiveSession] = useState(null);  
  const [chatHistory, setChatHistory] = useState([]);        
  
  // Streaming Optimization States
  const [streamingContent, setStreamingContent] = useState('');
  const abortControllerRef = useRef(null);

  const [isChatting, setIsChatting] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [hoveredSession, setHoveredSession] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (user) fetchProjects();
  }, [user]);

  useEffect(() => {
    let interval;
    if (activeProject) {
      fetchDocuments(activeProject.id);
      fetchChatSessions(activeProject.id);
      if (projectWindow === 'docs') {
        interval = setInterval(() => fetchDocuments(activeProject.id), 5000);
      }
    }
    return () => clearInterval(interval);
  }, [activeProject, projectWindow]);

  // Load history whenever active session changes & cancel active streams
  useEffect(() => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
    }
    setStreamingContent('');
    setIsChatting(false);

    if (activeSession) {
      fetchSessionHistory(activeProject.id, activeSession.id);
    } else {
      setChatHistory([]);
    }
  }, [activeSession]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, streamingContent]);

  const fetchProjects = async () => {
    const res = await fetch('http://localhost:8000/api/projects/', jsonFetchOptions);
    if (res.ok) setProjects(await res.json());
  };

  const fetchDocuments = async (projectId) => {
    const res = await fetch(`http://localhost:8000/api/projects/${projectId}/documents/`, jsonFetchOptions);
    if (res.ok) setDocuments(await res.json());
  };

  const fetchChatSessions = async (projectId) => {
    const res = await fetch(`http://localhost:8000/api/projects/${projectId}/sessions/`, jsonFetchOptions);
    if (res.ok) {
      const sessions = await res.json();
      setChatSessions(sessions);
      if (sessions.length > 0 && !activeSession) {
        setActiveSession(sessions[0]);
      } else if (sessions.length === 0) {
        setActiveSession(null);
      }
    }
  };

  const fetchSessionHistory = async (projectId, sessionId) => {
    const res = await fetch(
      `http://localhost:8000/api/projects/${projectId}/sessions/${sessionId}/history/`,
      jsonFetchOptions
    );
    if (res.ok) setChatHistory(await res.json());
  };

  const createNewSession = async () => {
    if (!activeProject) return;
    const res = await fetch(
      `http://localhost:8000/api/projects/${activeProject.id}/sessions/`,
      { ...jsonFetchOptions, method: 'POST', body: JSON.stringify({}) }
    );
    if (res.ok) {
      const newSession = await res.json();
      setChatSessions(prev => [newSession, ...prev]);
      setActiveSession(newSession);
      setChatHistory([]);
    }
  };

  const deleteSession = async (sessionId, e) => {
    e.stopPropagation();
    if (!activeProject) return;
    const res = await fetch(
      `http://localhost:8000/api/projects/${activeProject.id}/sessions/${sessionId}/delete/`,
      { ...fetchOptions, method: 'DELETE' }
    );
    if (res.ok) {
      const remaining = chatSessions.filter(s => s.id !== sessionId);
      setChatSessions(remaining);
      if (activeSession?.id === sessionId) {
        const next = remaining[0] || null;
        setActiveSession(next);
        if (!next) setChatHistory([]);
      }
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
      setAuthError(endpoint === 'login'
        ? 'Incorrect username or password.'
        : 'Signup failed. User might exist.');
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
    e.stopPropagation();
    const res = await fetch(`http://localhost:8000/api/projects/${projectId}/delete/`, {
      ...fetchOptions, method: 'DELETE',
    });
    if (res.ok) fetchProjects();
  };

  const handleFileUpload = async () => {
    if (!selectedFile || !activeProject) return;
    const formData = new FormData();
    formData.append('file', selectedFile);
    const res = await fetch(
      `http://localhost:8000/api/projects/${activeProject.id}/documents/`,
      { ...fetchOptions, method: 'POST', body: formData }
    );
    if (res.ok) {
      setSelectedFile(null);
      fetchDocuments(activeProject.id);
    }
  };

  const deleteDocument = async (docId) => {
    const res = await fetch(
      `http://localhost:8000/api/projects/${activeProject.id}/documents/${docId}/delete/`,
      { ...fetchOptions, method: 'DELETE' }
    );
    if (res.ok) fetchDocuments(activeProject.id);
  };

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || !activeProject || !activeSession) return;

    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const sentMessage = chatMessage;
    // Push user message immediately
    setChatHistory(prev => [...prev, { role: 'user', content: sentMessage }]);
    setChatMessage('');
    setIsChatting(true);
    setStreamingContent('');

    try {
      const res = await fetch(`http://localhost:8000/api/projects/${activeProject.id}/chat/`, {
        ...jsonFetchOptions,
        method: 'POST',
        body: JSON.stringify({ message: sentMessage, session_id: activeSession.id }),
        signal: abortControllerRef.current.signal
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let aiResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        aiResponse += decoder.decode(value, { stream: true });
        // Update the isolated streaming state instead of the array to prevent memory leaks
        setStreamingContent(aiResponse);
      }
      
      // Once complete, push to formal history array
      setChatHistory(prev => [...prev, { role: 'ai', content: aiResponse }]);
      setStreamingContent('');

    } catch (error) {
      if (error.name === 'AbortError') {
          console.log('Stream cancelled by user navigation.');
      } else {
          console.error('Chat error:', error);
          setChatHistory(prev => [...prev, { role: 'ai', content: 'An error occurred while communicating with the AI.' }]);
      }
      setStreamingContent('');
    } finally {
      setIsChatting(false);
      abortControllerRef.current = null;
    }
  };

  const addTeamMember = async () => {
    if (!newMemberName.trim() || !activeProject) return;
    const res = await fetch(
      `http://localhost:8000/api/projects/${activeProject.id}/team/add/`,
      { ...jsonFetchOptions, method: 'POST', body: JSON.stringify({ username: newMemberName }) }
    );
    if (res.ok) {
      alert(`Added ${newMemberName} to the project!`);
      setNewMemberName('');
    } else {
      alert('Failed to add member. Ensure the username exists.');
    }
  };

  // --- Dynamic UI Component Renderer Engine ---
  const renderMessageContent = (content) => {
    if (!content) return null;
    const parts = [];
    // Regex isolates JSON blocks generated by the AI
    const jsonRegex = /```json\s*([\s\S]*?)\s*```/g;
    let lastIndex = 0;
    let match;

    while ((match = jsonRegex.exec(content)) !== null) {
      // 1. Render normal text preceding the JSON block
      if (match.index > lastIndex) {
        parts.push(<span key={lastIndex} style={{ whiteSpace: 'pre-wrap' }}>{content.substring(lastIndex, match.index)}</span>);
      }
      
      // 2. Parse and render the structured UI component
      try {
        const data = JSON.parse(match[1]);
        if (data.type === 'bar_chart') {
          // Safeguard against zero-division
          const maxVal = Math.max(...data.data.map(d => Math.abs(d.value)), 1); 
          parts.push(
            <div key={match.index} style={{ margin: '16px 0', padding: '20px', background: '#fff', borderRadius: '12px', border: `1px solid ${palette.neutral}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <h4 style={{ margin: '0 0 16px 0', color: palette.textDark, textAlign: 'center' }}>{data.title || 'Data Visualization'}</h4>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '220px', paddingBottom: '8px', borderBottom: `2px solid ${palette.neutral}` }}>
                {data.data.map((item, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                    <div style={{ fontSize: '13px', marginBottom: '6px', fontWeight: 'bold', color: palette.textDark }}>
                       {item.value.toLocaleString()}
                    </div>
                    {/* The dynamic Bar */}
                    <div style={{ 
                      background: palette.chartBar, width: '100%', maxWidth: '50px',
                      height: `${(Math.abs(item.value) / maxVal) * 100}%`, 
                      minHeight: '4px', borderRadius: '4px 4px 0 0',
                      transition: 'height 0.4s ease-out' 
                    }}></div>
                    <div style={{ fontSize: '12px', marginTop: '8px', textAlign: 'center', color: palette.textDark, fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                      {item.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        } else {
          // Fallback if AI generates unstructured JSON
          parts.push(<pre key={match.index} style={{ background: palette.surface, padding: '12px', borderRadius: '8px', overflowX: 'auto', fontSize: '13px' }}>{match[0]}</pre>);
        }
      } catch (e) {
        // If JSON is invalid (e.g., currently streaming mid-way), render as standard text block
        parts.push(<pre key={match.index} style={{ background: palette.surface, padding: '12px', borderRadius: '8px', overflowX: 'auto', fontSize: '13px', opacity: 0.7 }}>Generating graphic...</pre>);
      }
      
      lastIndex = jsonRegex.lastIndex;
    }

    // 3. Render any trailing text
    if (lastIndex < content.length) {
      parts.push(<span key={lastIndex} style={{ whiteSpace: 'pre-wrap' }}>{content.substring(lastIndex)}</span>);
    }

    return parts;
  };

  const containerStyle = { minHeight: '100vh', background: palette.background, padding: '40px', fontFamily: 'system-ui', color: palette.textDark };
  const cardStyle = { background: palette.surface, padding: '30px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' };
  const inputStyle = { width: '100%', padding: '14px', borderRadius: '8px', border: `1px solid ${palette.neutral}`, outline: 'none', boxSizing: 'border-box' };
  const btnStyle = { padding: '14px 24px', borderRadius: '8px', border: 'none', background: palette.primary, color: '#fff', cursor: 'pointer', fontWeight: 'bold' };

  if (!user) {
    return (
      <div style={{ ...containerStyle, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ ...cardStyle, width: '400px' }}>
          <h1 style={{ textAlign: 'center', color: palette.primary, marginBottom: '10px' }}>AI Workspace</h1>
          <p style={{ textAlign: 'center', color: palette.textDark, marginBottom: '30px' }}>Sign in to continue</p>
          {authError && <div style={{ background: palette.warning, color: palette.textDark, padding: '12px', borderRadius: '8px', marginBottom: '15px', textAlign: 'center' }}>{authError}</div>}
          <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} style={{ ...inputStyle, marginBottom: '15px' }} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...inputStyle, marginBottom: '20px' }} />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => handleAuth('login')} style={{ ...btnStyle, flex: 1 }}>Login</button>
            <button onClick={() => handleAuth('signup')} style={{ ...btnStyle, flex: 1, background: palette.neutral, color: palette.textDark }}>Sign Up</button>
          </div>
        </div>
      </div>
    );
  }

  if (activeProject) {
    return (
      <div style={{ ...containerStyle, padding: '0', display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', background: palette.surface, borderBottom: `1px solid ${palette.neutral}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button onClick={() => { setActiveProject(null); setActiveSession(null); setChatSessions([]); setChatHistory([]); }} style={{ ...btnStyle, background: palette.neutral, color: palette.textDark, padding: '10px 18px' }}>← Dashboard</button>
            <h2 style={{ margin: 0, color: palette.textDark }}>{activeProject.name}</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['chat', 'docs'].map(tab => (
              <button key={tab} onClick={() => setProjectWindow(tab)} style={{ ...btnStyle, padding: '10px 20px', background: projectWindow === tab ? palette.primary : 'transparent', color: projectWindow === tab ? '#fff' : palette.textDark, border: projectWindow === tab ? 'none' : `1px solid ${palette.neutral}` }}>
                {tab === 'chat' ? '💬 Research Chat' : '📎 Documents'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input placeholder="Username to invite..." value={newMemberName} onChange={e => setNewMemberName(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${palette.neutral}`, outline: 'none', width: '180px' }} />
            <button onClick={addTeamMember} style={{ ...btnStyle, padding: '10px 16px' }}>+ Invite</button>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {projectWindow === 'chat' && (
            <>
              <div style={{ width: '260px', flexShrink: 0, background: palette.sidebarBg, borderRight: `1px solid ${palette.neutral}`, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ padding: '16px' }}>
                  <button onClick={createNewSession} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `1px dashed ${palette.primary}`, background: 'transparent', color: palette.primary, fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}>+ New Chat</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px 8px' }}>
                  {chatSessions.length === 0 ? <p style={{ color: palette.textDark, opacity: 0.5, fontSize: '13px', textAlign: 'center', marginTop: '20px' }}>No chats yet</p> : (
                    chatSessions.map(session => {
                      const isActive = activeSession?.id === session.id;
                      const isHovered = hoveredSession === session.id;
                      return (
                        <div key={session.id} onClick={() => setActiveSession(session)} onMouseEnter={() => setHoveredSession(session.id)} onMouseLeave={() => setHoveredSession(null)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '8px', marginBottom: '4px', cursor: 'pointer', background: isActive ? palette.sidebarActive : isHovered ? palette.sidebarHover : 'transparent', color: isActive ? '#fff' : palette.textDark, transition: 'background 0.15s ease' }}>
                          <span style={{ fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>💬 {session.title}</span>
                          {(isHovered || isActive) && (
                            <button onClick={e => deleteSession(session.id, e)} title="Delete chat" style={{ marginLeft: '8px', padding: '2px 6px', background: 'transparent', border: 'none', cursor: 'pointer', color: isActive ? 'rgba(255,255,255,0.8)' : palette.warning, fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>🗑</button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '20px' }}>
                {!activeSession ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: palette.textDark, opacity: 0.6 }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
                    <h3 style={{ margin: '0 0 8px 0' }}>No chat selected</h3>
                    <p style={{ margin: 0, fontSize: '14px' }}>Click "+ New Chat" to start a conversation</p>
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: '12px', paddingBottom: '10px', borderBottom: `1px solid ${palette.neutral}` }}>
                      <span style={{ fontWeight: 'bold', color: palette.textDark }}>{activeSession.title}</span>
                      <span style={{ marginLeft: '10px', fontSize: '12px', color: palette.textDark, opacity: 0.5 }}>{chatHistory.length} messages</span>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: '#fff', borderRadius: '12px', border: `1px solid ${palette.neutral}`, marginBottom: '14px' }}>
                      {chatHistory.length === 0 && !isChatting ? (
                        <p style={{ color: palette.textDark, textAlign: 'center', marginTop: '50px', fontStyle: 'italic', opacity: 0.6 }}>Send a message to start researching.</p>
                      ) : (
                        chatHistory.map((msg, idx) => (
                          <div key={idx} style={{ marginBottom: '14px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                            <div style={{ display: 'inline-block', padding: '12px 16px', borderRadius: '16px', background: msg.role === 'user' ? palette.neutral : palette.secondary, color: palette.textDark, maxWidth: '80%', lineHeight: '1.5', textAlign: 'left' }}>
                              {renderMessageContent(msg.content)}
                            </div>
                          </div>
                        ))
                      )}
                      
                      {/* --- Streaming Content Isolation Fix --- */}
                      {streamingContent && (
                        <div style={{ marginBottom: '14px', textAlign: 'left' }}>
                          <div style={{ display: 'inline-block', padding: '12px 16px', borderRadius: '16px', background: palette.secondary, color: palette.textDark, maxWidth: '80%', lineHeight: '1.5', textAlign: 'left' }}>
                            {renderMessageContent(streamingContent)}
                            <span style={{ display: 'inline-block', width: '6px', height: '14px', background: palette.textDark, marginLeft: '6px', verticalAlign: 'middle', opacity: 0.7 }}></span>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input type="text" placeholder="Ask about your documents..." value={chatMessage} onChange={e => setChatMessage(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendMessage()} disabled={isChatting} style={{ ...inputStyle, flex: 1 }} />
                      <button onClick={handleSendMessage} disabled={isChatting} style={{ ...btnStyle, background: isChatting ? palette.neutral : palette.primary }}>{isChatting ? 'Thinking...' : 'Send'}</button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {projectWindow === 'docs' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
              <div style={cardStyle}>
                <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: `1px solid ${palette.neutral}`, marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input type="file" accept=".pdf" onChange={e => setSelectedFile(e.target.files[0])} style={{ flex: 1 }} />
                  <button onClick={handleFileUpload} style={btnStyle}>Upload & Process</button>
                </div>
                <h3>Project Knowledge Base</h3>
                {documents.length === 0 ? <p>No documents uploaded yet.</p> : (
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {documents.map(doc => (
                      <li key={doc.id} style={{ border: `1px solid ${palette.neutral}`, background: '#fff', borderRadius: '8px', padding: '15px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{doc.title}</span>
                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                          <span style={{ fontSize: '14px', fontWeight: 'bold', color: doc.status === 'Ready' ? '#4caf50' : palette.textDark }}>{doc.status}</span>
                          <button onClick={() => deleteDocument(doc.id)} style={{ padding: '6px 12px', background: palette.warning, color: palette.textDark, border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Remove</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ ...cardStyle, marginBottom: '30px', background: palette.primary, color: '#fff' }}>
        <h1 style={{ margin: 0 }}>Welcome, {user}</h1>
        <p style={{ margin: '10px 0 0 0', opacity: 0.9 }}>Manage your workspaces</p>
      </div>
      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
          <input placeholder="New Project Name" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <button onClick={createProject} style={btnStyle}>Create Project</button>
        </div>
        <h3>Your Workspaces</h3>
        {projects.length === 0 ? <p>No projects found.</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {projects.map(p => (
              <div key={p.id} onClick={() => setActiveProject(p)} style={{ border: `1px solid ${palette.neutral}`, background: '#fff', padding: '20px', borderRadius: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: '0 0 8px 0', color: palette.primary }}>{p.name}</h3>
                  <p style={{ color: palette.textDark, fontSize: '14px', margin: 0 }}>Team: {p.team__name}</p>
                </div>
                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={e => deleteProject(p.id, e)} style={{ padding: '8px 16px', background: palette.warning, color: palette.textDark, border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Delete Project</button>
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