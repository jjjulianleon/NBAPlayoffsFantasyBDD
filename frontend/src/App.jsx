import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import { ToastProvider } from './components/Toast'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Players from './pages/Players'
import PlayerDetail from './pages/PlayerDetail'
import HotCold from './pages/HotCold'
import Games from './pages/Games'
import Leagues from './pages/Leagues'
import LeagueDetail from './pages/LeagueDetail'
import Draft from './pages/Draft'
import TeamRoster from './pages/TeamRoster'
import Reports from './pages/Reports'
import Profile from './pages/Profile'

export default function App() {
  return (
    <ToastProvider>
      <div className="app-shell">
        <Navbar />
        <div className="pt-16">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/players" element={<Players />} />
            <Route path="/players/:id" element={<PlayerDetail />} />
            <Route path="/hot-cold" element={<HotCold />} />
            <Route path="/games" element={<Games />} />
            <Route path="/leagues" element={<Leagues />} />
            <Route path="/leagues/:id" element={<LeagueDetail />} />
            <Route path="/leagues/:id/draft" element={<Draft />} />
            <Route path="/teams/:id" element={<TeamRoster />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </div>
      </div>
    </ToastProvider>
  )
}
