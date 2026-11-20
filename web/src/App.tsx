import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./theme.css";
import { AppPage } from "./pages/AppPage";
import { Landing } from "./pages/Landing";
import { LandingInfo } from "./pages/LandingInfo";
import { MobileApp } from "./mobile/MobileApp";
import { MobileHome } from "./mobile/MobileHome";
import { useIsMobile } from "./mobile/useIsMobile";

function App() {
  // 폭 640px 이하는 Figma 모바일 화면(src/mobile), 그보다 넓으면 기존 PC 화면.
  const isMobile = useIsMobile();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={isMobile ? <MobileHome /> : <Landing />} />
        <Route path="/service" element={<LandingInfo section="service" />} />
        <Route path="/methodology" element={<LandingInfo section="methodology" />} />
        <Route path="/validation" element={<LandingInfo section="validation" />} />
        <Route path="/app" element={isMobile ? <MobileApp /> : <AppPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
