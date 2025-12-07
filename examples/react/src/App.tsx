import './App.css'

function App() {
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>DevInspector</h1>
        <p className="subtitle">AI-Powered Visual Debugging Demo</p>
      </header>

      <div className="grid">
        {/* Card 1: Visual Bug */}
        <div className="card">
          <h2>
            Visual Inspector
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
            The "Sign Up" button below is unresponsive. Use the Inspector to identify the invisible element blocking interactions.
          </p>

          <div style={{ position: 'relative' }}>
            <button className="btn" onClick={() => alert('Success! You clicked me!')}>
              Sign Up Free
            </button>

            {/* THE BUG: Invisible overlay blocking clicks */}
            <div className="bug-overlay" style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 9999, // The culprit
              cursor: 'default' // No hint
            }}></div>
          </div>
        </div>

        {/* Card 2: Network Bug */}
        <div className="card">
          <h2>
            Network Inspector
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
            User data is fetched from an external API but fails to render correctly. Analyze the network response to find the schema mismatch.
          </p>

          <button className="btn" style={{ backgroundColor: 'white', color: 'black', border: '1px solid #e1e1e1' }} onClick={() => {
            fetch('https://jsonplaceholder.typicode.com/users/1')
              .then(res => res.json())
              .then(data => {
                // Update UI with buggy data mapping
                const nameEl = document.getElementById('user-name');
                const handleEl = document.getElementById('user-handle');
                const avatarEl = document.getElementById('user-avatar') as HTMLImageElement;
                const container = document.getElementById('profile-container');

                if (container) container.style.display = 'flex';

                // Bugs:
                if (nameEl) nameEl.innerText = data.name;
                if (handleEl) handleEl.innerText = '@' + (data.handle || 'unknown'); // Bug: API returns 'username', not 'handle'
                if (avatarEl) avatarEl.src = data.website; // Bug: API returns text domain, not image URL
              })
          }}>
            Load User Profile
          </button>

          <div id="profile-container" className="user-profile" style={{ display: 'none' }}>
            <div className="avatar-placeholder">
              <img id="user-avatar" alt="User" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <div className="user-details">
              <div id="user-name" className="user-name">Loading...</div>
              <div id="user-handle" className="user-handle">@loading</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
