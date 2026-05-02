import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import NoteDetail from './pages/NoteDetail'
import Search from './pages/Search'
import Graph from './pages/Graph'
import Rss from './pages/Rss'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<LayoutRoute />}>
        <Route path="/" element={<Home />} />
        <Route path="/note/:id" element={<NoteDetail />} />
        <Route path="/search" element={<Search />} />
        <Route path="/graph" element={<Graph />} />
        <Route path="/rss" element={<Rss />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

import { Outlet } from 'react-router-dom'
function LayoutRoute() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}
