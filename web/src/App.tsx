import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./theme.css";
import { AppPage } from "./pages/AppPage";
import { Landing } from "./pages/Landing";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<AppPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
