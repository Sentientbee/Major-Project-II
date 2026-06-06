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
  const [chatSessions, setChatSessions] = useState([]);      // all sessions for project
  const [activeSession, setActiveSession] = useState(null);  // currently open tab
  const [chatHistory, setChatHistory] = useState([]);        // messages in active session
  const [isChatting, setIsChatting] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [hoveredSession, setHoveredSession] = useState(null);
  const chatEndRef = useRef(null);

  // -----------------------------------------------------------------------
  // Effects
  // -----------------------------------------------------------------------

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

  // Load history whenever active session changes
  useEffect(() => {
    if (activeSession) {
      fetchSessionHistory(activeProject.id, activeSession.id);
    } else {
      setChatHistory([]);
    }
  }, [activeSession]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // -----------------------------------------------------------------------
  // API helpers
  // -----------------------------------------------------------------------

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
      // Auto-select the most recent session if none is active
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

  // -----------------------------------------------------------------------
  // Session management
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Auth
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Projects
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Documents
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Chat
  // -----------------------------------------------------------------------

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || !activeProject || !activeSession) return;

    const optimisticHistory = [
      ...chatHistory,
      { role: 'user', content: chatMessage },
      { role: 'ai', content: '' },
    ];
    setChatHistory(optimisticHistory);
    const sentMessage = chatMessage;
    setChatMessage('');
    setIsChatting(true);

    try {
      const res = await fetch(`http://localhost:8000/api/projects/${activeProject.id}/chat/`, {
        ...jsonFetchOptions,
        method: 'POST',
        body: JSON.stringify({ message: sentMessage, session_id: activeSession.id }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let aiResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        aiResponse += decoder.decode(value, { stream: true });
        setChatHistory(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'ai', content: aiResponse };
          return updated;
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsChatting(false);
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

  // -----------------------------------------------------------------------
  // Shared styles
  // -----------------------------------------------------------------------

  const containerStyle = {
    minHeight: '100vh',
    background: palette.background,
    padding: '40px',
    fontFamily: 'system-ui',
    color: palette.textDark,
  };
  const cardStyle = {
    background: palette.surface,
    padding: '30px',
    borderRadius: '16px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
  };
  const inputStyle = {
    width: '100%',
    padding: '14px',
    borderRadius: '8px',
    border: `1px solid ${palette.neutral}`,
    outline: 'none',
    boxSizing: 'border-box',
  };
  const btnStyle = {
    padding: '14px 24px',
    borderRadius: '8px',
    border: 'none',
    background: palette.primary,
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold',
  };

  // -----------------------------------------------------------------------
  // VIEW: Login
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // VIEW: Project Detail (two-column: sidebar + main)
  // -----------------------------------------------------------------------

  if (activeProject) {
    return (
      <div style={{ ...containerStyle, padding: '0', display: 'flex', flexDirection: 'column', height: '100vh' }}>

        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 28px', background: palette.surface,
          borderBottom: `1px solid ${palette.neutral}`, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => { setActiveProject(null); setActiveSession(null); setChatSessions([]); setChatHistory([]); }}
              style={{ ...btnStyle, background: palette.neutral, color: palette.textDark, padding: '10px 18px' }}
            >
              ← Dashboard
            </button>
            <h2 style={{ margin: 0, color: palette.textDark }}>{activeProject.name}</h2>
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {['chat', 'docs'].map(tab => (
              <button
                key={tab}
                onClick={() => setProjectWindow(tab)}
                style={{
                  ...btnStyle,
                  padding: '10px 20px',
                  background: projectWindow === tab ? palette.primary : 'transparent',
                  color: projectWindow === tab ? '#fff' : palette.textDark,
                  border: projectWindow === tab ? 'none' : `1px solid ${palette.neutral}`,
                }}
              >
                {tab === 'chat' ? '💬 Research Chat' : '📎 Documents'}
              </button>
            ))}
          </div>

          {/* Team invite */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              placeholder="Username to invite..."
              value={newMemberName}
              onChange={e => setNewMemberName(e.target.value)}
              style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${palette.neutral}`, outline: 'none', width: '180px' }}
            />
            <button onClick={addTeamMember} style={{ ...btnStyle, padding: '10px 16px' }}>+ Invite</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ---- CHAT VIEW: sidebar + chat panel ---- */}
          {projectWindow === 'chat' && (
            <>
              {/* Chat sidebar */}
              <div style={{
                width: '260px', flexShrink: 0,
                background: palette.sidebarBg,
                borderRight: `1px solid ${palette.neutral}`,
                display: 'flex', flexDirection: 'column',
                overflowY: 'auto',
              }}>
                {/* New chat button */}
                <div style={{ padding: '16px' }}>
                  <button
                    onClick={createNewSession}
                    style={{
                      width: '100%', padding: '12px',
                      borderRadius: '8px', border: `1px dashed ${palette.primary}`,
                      background: 'transparent', color: palette.primary,
                      fontWeight: 'bold', cursor: 'pointer', fontSize: '14px',
                    }}
                  >
                    + New Chat
                  </button>
                </div>

                {/* Session list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px 8px' }}>
                  {chatSessions.length === 0 ? (
                    <p style={{ color: palette.textDark, opacity: 0.5, fontSize: '13px', textAlign: 'center', marginTop: '20px' }}>
                      No chats yet
                    </p>
                  ) : (
                    chatSessions.map(session => {
                      const isActive = activeSession?.id === session.id;
                      const isHovered = hoveredSession === session.id;
                      return (
                        <div
                          key={session.id}
                          onClick={() => setActiveSession(session)}
                          onMouseEnter={() => setHoveredSession(session.id)}
                          onMouseLeave={() => setHoveredSession(null)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 12px', borderRadius: '8px', marginBottom: '4px',
                            cursor: 'pointer',
                            background: isActive ? palette.sidebarActive : isHovered ? palette.sidebarHover : 'transparent',
                            color: isActive ? '#fff' : palette.textDark,
                            transition: 'background 0.15s ease',
                          }}
                        >
                          <span style={{ fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            💬 {session.title}
                          </span>
                          {/* Delete button — shown on hover */}
                          {(isHovered || isActive) && (
                            <button
                              onClick={e => deleteSession(session.id, e)}
                              title="Delete chat"
                              style={{
                                marginLeft: '8px', padding: '2px 6px',
                                background: 'transparent',
                                border: 'none', cursor: 'pointer',
                                color: isActive ? 'rgba(255,255,255,0.8)' : palette.warning,
                                fontSize: '16px', lineHeight: 1, flexShrink: 0,
                              }}
                            >
                              🗑
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Chat main panel */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '20px' }}>
                {!activeSession ? (
                  /* Empty state */
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: palette.textDark, opacity: 0.6 }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
                    <h3 style={{ margin: '0 0 8px 0' }}>No chat selected</h3>
                    <p style={{ margin: 0, fontSize: '14px' }}>Click "+ New Chat" to start a conversation</p>
                  </div>
                ) : (
                  <>
                    {/* Session title */}
                    <div style={{ marginBottom: '12px', paddingBottom: '10px', borderBottom: `1px solid ${palette.neutral}` }}>
                      <span style={{ fontWeight: 'bold', color: palette.textDark }}>{activeSession.title}</span>
                      <span style={{ marginLeft: '10px', fontSize: '12px', color: palette.textDark, opacity: 0.5 }}>
                        {chatHistory.length} message{chatHistory.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Messages */}
                    <div style={{
                      flex: 1, overflowY: 'auto', padding: '16px',
                      background: '#fff', borderRadius: '12px',
                      border: `1px solid ${palette.neutral}`, marginBottom: '14px',
                    }}>
                      {chatHistory.length === 0 ? (
                        <p style={{ color: palette.textDark, textAlign: 'center', marginTop: '50px', fontStyle: 'italic', opacity: 0.6 }}>
                          Send a message to start researching.
                        </p>
                      ) : (
                        chatHistory.map((msg, idx) => (
                          <div key={idx} style={{ marginBottom: '14px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                            <span style={{
                              display: 'inline-block', padding: '12px 16px', borderRadius: '16px',
                              background: msg.role === 'user' ? palette.neutral : palette.secondary,
                              color: palette.textDark, maxWidth: '80%', lineHeight: '1.5', whiteSpace: 'pre-wrap',
                            }}>
                              {msg.content || (msg.role === 'ai' ? '⋯' : '')}
                            </span>
                          </div>
                        ))
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Input bar */}
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input
                        type="text"
                        placeholder="Ask about your documents or search the web..."
                        value={chatMessage}
                        onChange={e => setChatMessage(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
                        disabled={isChatting}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={isChatting}
                        style={{ ...btnStyle, background: isChatting ? palette.neutral : palette.primary }}
                      >
                        {isChatting ? 'Thinking...' : 'Send'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* ---- DOCS VIEW ---- */}
          {projectWindow === 'docs' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
              <div style={cardStyle}>
                <div style={{
                  background: '#fff', padding: '20px', borderRadius: '12px',
                  border: `1px solid ${palette.neutral}`, marginBottom: '20px',
                  display: 'flex', gap: '10px', alignItems: 'center',
                }}>
                  <input type="file" accept=".pdf" onChange={e => setSelectedFile(e.target.files[0])} style={{ flex: 1 }} />
                  <button onClick={handleFileUpload} style={btnStyle}>Upload & Process</button>
                </div>

                <h3>Project Knowledge Base</h3>
                {documents.length === 0 ? <p>No documents uploaded yet.</p> : (
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {documents.map(doc => (
                      <li key={doc.id} style={{
                        border: `1px solid ${palette.neutral}`, background: '#fff',
                        borderRadius: '8px', padding: '15px', marginBottom: '10px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <span>{doc.title}</span>
                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                          <span style={{ fontSize: '14px', fontWeight: 'bold', color: doc.status === 'Ready' ? '#4caf50' : palette.textDark }}>
                            {doc.status}
                          </span>
                          <button
                            onClick={() => deleteDocument(doc.id)}
                            style={{ padding: '6px 12px', background: palette.warning, color: palette.textDark, border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                          >
                            Remove
                          </button>
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

  // -----------------------------------------------------------------------
  // VIEW: Dashboard
  // -----------------------------------------------------------------------

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
              <div
                key={p.id}
                onClick={() => setActiveProject(p)}
                style={{
                  border: `1px solid ${palette.neutral}`, background: '#fff',
                  padding: '20px', borderRadius: '12px', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                }}
              >
                <div>
                  <h3 style={{ margin: '0 0 8px 0', color: palette.primary }}>{p.name}</h3>
                  <p style={{ color: palette.textDark, fontSize: '14px', margin: 0 }}>Team: {p.team__name}</p>
                </div>
                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={e => deleteProject(p.id, e)}
                    style={{ padding: '8px 16px', background: palette.warning, color: palette.textDark, border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                  >
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
