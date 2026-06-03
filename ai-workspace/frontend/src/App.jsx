import React, { useState, useEffect } from 'react';

// Make sure credentials (cookies) are sent with every fetch
const fetchOptions = {
  headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch('http://localhost:8000/api/projects/');
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
      fetchProjects(); // Refresh the list
    }
  };

  if (!user) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
        <h2>AI Research Workspace - Login</h2>
        <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} /><br/><br/>
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} /><br/><br/>
        <button onClick={() => handleAuth('login')}>Login</button>
        <button onClick={() => handleAuth('signup')} style={{ marginLeft: '10px' }}>Sign Up</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h2>Welcome, {user}</h2>
      
      <div style={{ border: '1px solid #ccc', padding: '1rem', marginTop: '1rem' }}>
        <h3>Your Workspaces</h3>
        {projects.length === 0 ? <p>No projects found. Create one below!</p> : (
          <ul>
            {projects.map(p => <li key={p.id}>{p.name} (Team: {p.team__name})</li>)}
          </ul>
        )}
        
        <input 
          placeholder="New Project Name" 
          value={newProjectName} 
          onChange={e => setNewProjectName(e.target.value)} 
        />
        <button onClick={createProject} style={{ marginLeft: '10px' }}>Create Project</button>
      </div>
    </div>
  );
}

export default App;
