import { useState, useEffect, useCallback, useMemo } from "react";

// Move utility function outside component to avoid recreation
const sanitizeFilename = (str) => str.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

// Memoize static styles outside component
const containerStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  padding: "40px 20px"
};

const cardStyle = {
  maxWidth: "800px",
  width: "100%",
  background: "#fff",
  borderRadius: "20px",
  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  padding: "50px"
};

const titleStyle = {
  fontSize: "36px",
  fontWeight: "bold",
  color: "#333",
  marginBottom: "10px",
  textAlign: "center"
};

const subtitleStyle = {
  fontSize: "16px",
  color: "#666",
  marginBottom: "40px",
  textAlign: "center"
};

const labelStyle = {
  display: "block",
  fontSize: "14px",
  fontWeight: "600",
  color: "#333",
  marginBottom: "8px"
};

const inputBaseStyle = {
  width: "100%",
  padding: "14px 16px",
  fontSize: "16px",
  border: "2px solid #e0e0e0",
  borderRadius: "12px",
  outline: "none",
  transition: "all 0.3s"
};

const selectStyle = {
  ...inputBaseStyle,
  cursor: "pointer"
};

const textareaStyle = {
  ...inputBaseStyle,
  resize: "vertical",
  fontFamily: "inherit",
  fontSize: "15px"
};

const infoBoxStyle = {
  marginTop: "30px",
  padding: "20px",
  background: "#f8f9fa",
  borderRadius: "12px",
  border: "1px solid #e0e0e0"
};

const infoTitleStyle = {
  fontSize: "16px",
  fontWeight: "600",
  color: "#333",
  marginBottom: "12px"
};

const infoListStyle = {
  fontSize: "14px",
  color: "#666",
  lineHeight: "1.8",
  paddingLeft: "20px",
  margin: 0
};

const footerStyle = {
  marginTop: "30px",
  textAlign: "center",
  fontSize: "14px",
  color: "#999"
};

export default function Home() {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("template1");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jd, setJd] = useState("");
  const [disable, setDisable] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewFilename, setPreviewFilename] = useState("");

  // Load profiles on mount
  useEffect(() => {
    fetch("/api/profiles")
      .then(res => res.json())
      .then(data => setProfiles(data))
      .catch(err => console.error("Failed to load profiles:", err));
  }, []);

  // Memoize selected profile data
  const selectedProfileData = useMemo(() => {
    return profiles.find(p => p.id === selectedProfile);
  }, [profiles, selectedProfile]);

  // Memoize button style based on disable state
  const buttonStyle = useMemo(() => ({
    width: "100%",
    padding: "16px",
    fontSize: "18px",
    fontWeight: "bold",
    color: "#fff",
    background: disable ? "#ccc" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    border: "none",
    borderRadius: "12px",
    cursor: disable ? "not-allowed" : "pointer",
    transition: "all 0.3s",
    boxShadow: disable ? "none" : "0 4px 15px rgba(102, 126, 234, 0.4)"
  }), [disable]);

  // Helper function to generate PDF blob
  const generatePDFBlob = useCallback(async () => {
    if (!selectedProfile) throw new Error("Please select a profile");
    if (!jd) throw new Error("Please enter the Completed Resume JSON");
    if (!company) throw new Error("Please enter the Company Name");
    if (!role) throw new Error("Please enter the Role Name");

    const genRes = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        profile: selectedProfile,
        jd: jd,
        company: company,
        role: role,
        template: selectedTemplate
      })
    });

    if (!genRes.ok) {
      const errorText = await genRes.text();
      console.error('Error response:', errorText);
      
      // Try to parse as JSON to get detailed error
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || "Failed to generate PDF");
      } catch (e) {
        throw new Error(errorText || "Failed to generate PDF");
      }
    }

    return await genRes.blob();
  }, [selectedProfile, jd, company, role, selectedTemplate]);

  // Generate filename helper
  const getFilename = useCallback(() => {
    const profileName = selectedProfileData ? selectedProfileData.name : selectedProfile;
    const profileSanitized = sanitizeFilename(profileName);
    const companySanitized = sanitizeFilename(company);
    const roleSanitized = sanitizeFilename(role);
    return `${profileSanitized}_${companySanitized}_${roleSanitized}.pdf`;
  }, [selectedProfile, company, role, selectedProfileData]);

  // Preview PDF function
  const previewPDF = useCallback(async () => {
    if (disable) return;
    setDisable(true);

    try {
      const blob = await generatePDFBlob();
      const url = window.URL.createObjectURL(blob);
      const filename = getFilename();
      
      setPreviewUrl(url);
      setPreviewFilename(filename);
      setShowPreview(true);
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setDisable(false);
    }
  }, [disable, generatePDFBlob, getFilename]);

  // Download PDF function
  const generatePDF = useCallback(async () => {
    if (disable) return;
    setDisable(true);

    try {
      const blob = await generatePDFBlob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getFilename();
      a.click();
      window.URL.revokeObjectURL(url);

      alert("✅ Resume downloaded successfully!");
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setDisable(false);
    }
  }, [disable, generatePDFBlob, getFilename]);

  // Close preview and cleanup
  const closePreview = useCallback(() => {
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
    }
    setShowPreview(false);
    setPreviewUrl(null);
    setPreviewFilename("");
  }, [previewUrl]);

  // Download from preview
  const downloadFromPreview = useCallback(() => {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = previewFilename;
    a.click();
  }, [previewUrl, previewFilename]);

  // Memoize handlers to prevent re-renders
  const handleProfileChange = useCallback((e) => setSelectedProfile(e.target.value), []);
  const handleTemplateChange = useCallback((e) => setSelectedTemplate(e.target.value), []);
  const handleCompanyChange = useCallback((e) => setCompany(e.target.value), []);
  const handleRoleChange = useCallback((e) => setRole(e.target.value), []);
  const handleJdChange = useCallback((e) => setJd(e.target.value), []);

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>
          📄 Resume to PDF Converter
        </h1>
        <p style={subtitleStyle}>
          Select your profile, paste the completed resume JSON, and convert it to PDF!
        </p>

        {/* Profile Selection */}
        <div style={{ marginBottom: "30px" }}>
          <label style={labelStyle}>
            Select Profile <span style={{ color: "#e74c3c" }}>*</span>
          </label>
          <select
            value={selectedProfile}
            onChange={handleProfileChange}
            style={selectStyle}
          >
            <option value="">-- Select a profile --</option>
            {profiles.map(profile => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </div>

        {/* Template Selection */}
        <div style={{ marginBottom: "30px" }}>
          <label style={labelStyle}>
            Resume Template
          </label>
          <select
            value={selectedTemplate}
            onChange={handleTemplateChange}
            style={selectStyle}
          >
            <option value="template1">Template 1: Clean Professional (Single-Column)</option>
            <option value="template2">Template 2: Blue Gradient Header (Single-Column)</option>
            <option value="template3">Template 3: Modern Minimalist (Single-Column)</option>
            <option value="template4">Template 4: Compact Efficient (Single-Column)</option>
            <option value="template5">Template 5: Elegant Serif (Single-Column)</option>
            <option value="template6">Template 6: Purple Gradient (Single-Column)</option>
            <option value="template7">Template 7: Classic Traditional (Single-Column)</option>
            <option value="template8">Template 8: Ultra Minimal (Single-Column)</option>
            <option value="template9">Template 9: Classic Two-Column</option>
            <option value="template10">Template 10: Modern Two-Column</option>
            <option value="template11">⭐ Template 11: Fantastic Premium Design (Single-Column)</option>
          </select>
        </div>

        <div style={{ marginBottom: "30px" }}>
          <label style={labelStyle}>
            Company Name <span style={{ color: "#e74c3c" }}>*</span>
          </label>
          <input
            type="text"
            value={company}
            onChange={handleCompanyChange}
            placeholder="e.g., Google, Amazon..."
            style={inputBaseStyle}
          />
        </div>

        <div style={{ marginBottom: "30px" }}>
          <label style={labelStyle}>
            Role Name <span style={{ color: "#e74c3c" }}>*</span>
          </label>
          <input
            type="text"
            value={role}
            onChange={handleRoleChange}
            placeholder="e.g., Senior Software Engineer, Product Manager..."
            style={inputBaseStyle}
          />
        </div>

        {/* Completed Resume JSON */}
        <div style={{ marginBottom: "30px" }}>
          <label style={labelStyle}>
            Completed Resume JSON <span style={{ color: "#e74c3c" }}>*</span>
          </label>
          <textarea
            value={jd}
            onChange={handleJdChange}
            placeholder='Paste the completed resume JSON here... (format: {"title":"...","summary":"...","skills":{...},"experience":[...]})'
            rows="12"
            style={textareaStyle}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
          <button
            onClick={previewPDF}
            disabled={disable}
            style={{
              ...buttonStyle,
              flex: 1,
              background: disable ? "#ccc" : "linear-gradient(135deg, #48bb78 0%, #38a169 100%)",
              boxShadow: disable ? "none" : "0 4px 15px rgba(72, 187, 120, 0.4)"
            }}
          >
            {disable ? "⏳ Generating..." : "👁️ Preview PDF"}
          </button>
          <button
            onClick={generatePDF}
            disabled={disable}
            style={buttonStyle}
          >
            {disable ? "⏳ Converting..." : "📥 Download PDF"}
          </button>
        </div>

        {/* Info Box */}
        <div style={infoBoxStyle}>
          <h3 style={infoTitleStyle}>
            💡 How it works:
          </h3>
          <ul style={infoListStyle}>
            <li>Select your profile (name, contacts, work history, education)</li>
            <li>Paste the completed resume JSON (title, summary, skills, experience bullets)</li>
            <li>Enter company and role name for filename</li>
            <li>Download your resume as a PDF!</li>
          </ul>
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <p style={{ margin: 0 }}>
            Resume to PDF Converter
          </p>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && previewUrl && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}
          onClick={closePreview}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "900px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "20px",
                borderBottom: "1px solid #e0e0e0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <h2 style={{ margin: 0, fontSize: "20px", color: "#333" }}>
                📄 Resume Preview
              </h2>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={downloadFromPreview}
                  style={{
                    padding: "8px 16px",
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#fff",
                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(102, 126, 234, 0.3)"
                  }}
                >
                  📥 Download
                </button>
                <button
                  onClick={closePreview}
                  style={{
                    padding: "8px 16px",
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#333",
                    background: "#f0f0f0",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer"
                  }}
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* PDF Viewer */}
            <div
              style={{
                flex: 1,
                overflow: "auto",
                padding: "20px",
                display: "flex",
                justifyContent: "center",
                backgroundColor: "#f5f5f5"
              }}
            >
              <iframe
                src={previewUrl}
                style={{
                  width: "100%",
                  height: "70vh",
                  border: "none",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                }}
                title="Resume Preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
