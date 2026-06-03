import React, { useState, useEffect } from 'react';

const fetchOptions = {
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
};

function App() {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [projects, setProjects] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');

  useEffect(() => {
    if (user) fetchProjects();
  }, [user]);

  const fetchProjects = async () => {
    const res = await fetch('http://localhost:8000/api/projects/', fetchOptions);
    if (res.ok) setProjects(await res.json());
  };

  const handleAuth = async (endpoint) => {
    const res = await fetch(`http://localhost:8000/api/${endpoint}/`, {
      ...fetchOptions,
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
      ...fetchOptions,
      method: 'POST',
      body: JSON.stringify({ name: newProjectName }),
    });

    if (res.ok) {
      setNewProjectName('');
      fetchProjects();
    }
  };

  if (!user) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg,#667eea,#764ba2)',
          fontFamily: 'system-ui'
        }}
      >
        <div
          style={{
            width: '420px',
            background: '#fff',
            padding: '40px',
            borderRadius: '24px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
          }}
        >
          <h1 style={{ textAlign: 'center' }}>🚀 AI Research Workspace</h1>

          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: '100%', padding: '14px', marginTop: '20px', borderRadius: '12px' }}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '14px', marginTop: '15px', borderRadius: '12px' }}
          />

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button onClick={() => handleAuth('login')} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: '#667eea', color: '#fff' }}>
              Login
            </button>
            <button onClick={() => handleAuth('signup')} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: '#764ba2', color: '#fff' }}>
              Sign Up
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f7fc', padding: '40px', fontFamily: 'system-ui' }}>
      <div
        style={{
          background: 'linear-gradient(135deg,#667eea,#764ba2)',
          color: '#fff',
          padding: '30px',
          borderRadius: '24px',
          marginBottom: '25px'
        }}
      >
        <h1>👋 Welcome, {user}</h1>
        <p>Manage your AI projects efficiently</p>
      </div>

      <div
        style={{
          background: '#fff',
          padding: '25px',
          borderRadius: '20px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.08)'
        }}
      >
        <h2>Your Workspaces</h2>

        {projects.length === 0 ? (
          <p>No projects found. Create one below!</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {projects.map((p) => (
              <li
                key={p.id}
                style={{
                  background: '#eef2ff',
                  padding: '15px',
                  borderRadius: '12px',
                  marginBottom: '12px'
                }}
              >
                📁 {p.name}
                <br />
                <small>Team: {p.team__name}</small>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <input
            placeholder="New Project Name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            style={{ flex: 1, padding: '14px', borderRadius: '12px' }}
          />

          <button
            onClick={createProject}
            style={{
              padding: '14px 20px',
              borderRadius: '12px',
              border: 'none',
              background: '#667eea',
              color: '#fff'
            }}
          >
            ➕ Create
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
