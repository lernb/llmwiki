import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import WikiPage from "./pages/WikiPage";
import Sources from "./pages/Sources";
import GraphPage from "./pages/GraphPage";
import SearchPage from "./pages/SearchPage";
import AskPage from "./pages/AskPage";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/page/:slug" element={<WikiPage />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/ask" element={<AskPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
