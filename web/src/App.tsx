import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./theme.css";
import { AppPage } from "./pages/AppPage";
import { Landing } from "./pages/Landing";
import { LandingInfo } from "./pages/LandingInfo";
import { Privacy } from "./pages/Privacy";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/service" element={<LandingInfo section="service" />} />
        <Route path="/methodology" element={<LandingInfo section="methodology" />} />
        <Route path="/validation" element={<LandingInfo section="validation" />} />
        <Route path="/app" element={<AppPage />} />
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
