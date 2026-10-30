import React, { useState } from "react";

const FEATURE_CATALOG = [
  { id: "KYC_VERIFICATION", label: "Customer KYC & Verification Desk", cost: 8000 },
  { id: "UPI_PAYMENT", label: "Dynamic UPI QR & Payment Reconciliation", cost: 4500 },
  { id: "ADMIN_DESK", label: "24h Real-time Approvals Console", cost: 7000 },
  { id: "MULTI_LANG", label: "Multilingual Support (Hindi, Marathi, English)", cost: 3500 },
  { id: "WHATSAPP_BOT", label: "Automated WhatsApp Receipts & Notifications", cost: 5000 },
];

export const ClientIntakeWizard = () => {
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState("RETAIL");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [clientInfo, setClientInfo] = useState({ name: "", phone: "", email: "", business: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const toggleFeature = (id: string) => {
    setSelectedFeatures(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const calculateEstimate = () => {
    const base = category === "LENDING" ? 25000 : category === "HEALTHCARE" ? 22000 : 18000;
    const feats = selectedFeatures.reduce((acc, fId) => {
      const feat = FEATURE_CATALOG.find(fc => fc.id === fId);
      return acc + (feat ? feat.cost : 0);
    }, 0);
    return base + feats;
  };

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/v1/get-started/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: clientInfo.name,
          business_name: clientInfo.business,
          phone: clientInfo.phone,
          email: clientInfo.email || undefined,
          business_category: category,
          selected_features: selectedFeatures
        })
      });
      const data = await res.json();
      setResult(data);
      setStep(4);
    } catch (e) {
      alert("Submission error. Please verify backend connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-slate-900 border border-slate-800 rounded-2xl text-slate-100 shadow-2xl my-8">
      <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4 text-xs font-semibold">
        <span className={step >= 1 ? "text-indigo-400" : "text-slate-500"}>1. Business Profile</span>
        <span className={step >= 2 ? "text-indigo-400" : "text-slate-500"}>2. Feature Builder</span>
        <span className={step >= 3 ? "text-indigo-400" : "text-slate-500"}>3. Client Contact</span>
        <span className={step >= 4 ? "text-emerald-400" : "text-slate-500"}>4. SOW & Lock</span>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white">Select Your Industry / Business Type</h2>
          <div className="grid grid-cols-2 gap-4 pt-2">
            {[
              { id: "LENDING", title: "NBFC / Private Lending Desk" },
              { id: "RETAIL", title: "Retail & Supermarket Store" },
              { id: "HEALTHCARE", title: "Healthcare Clinic & Diagnostics" },
              { id: "CUSTOM", title: "Custom Marketplace / Services" }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`p-5 rounded-xl border text-left transition-all ${category === cat.id ? "border-indigo-500 bg-indigo-950/40 text-white shadow-lg" : "border-slate-800 bg-slate-950/60 text-slate-400"}`}
              >
                <div className="font-semibold text-sm">{cat.title}</div>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(2)} className="mt-6 w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-medium text-sm transition-all">
            Continue to Feature Selection →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white">Choose Required Platform Capabilities</h2>
          <div className="space-y-3 pt-2">
            {FEATURE_CATALOG.map(item => (
              <label key={item.id} className="flex items-center justify-between p-4 bg-slate-950/80 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedFeatures.includes(item.id)}
                    onChange={() => toggleFeature(item.id)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                <span className="text-xs text-indigo-300 font-semibold">+₹{item.cost.toLocaleString("en-IN")}</span>
              </label>
            ))}
          </div>

          <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-xl flex justify-between items-center mt-4">
            <span className="text-sm text-slate-300">Live Estimated Cost:</span>
            <span className="text-lg font-bold text-white">₹{calculateEstimate().toLocaleString("en-IN")}</span>
          </div>

          <div className="flex gap-4 pt-2">
            <button onClick={() => setStep(1)} className="w-1/3 py-3 border border-slate-700 rounded-xl text-sm">Back</button>
            <button onClick={() => setStep(3)} className="w-2/3 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-medium text-sm">Next: Contact Info →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white">Client Details for SOW Agreement</h2>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Full Name"
              value={clientInfo.name}
              onChange={e => setClientInfo({...clientInfo, name: e.target.value})}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
            />
            <input
              type="text"
              placeholder="Business / Organization Name"
              value={clientInfo.business}
              onChange={e => setClientInfo({...clientInfo, business: e.target.value})}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
            />
            <input
              type="tel"
              placeholder="Phone Number (for WhatsApp Proposal)"
              value={clientInfo.phone}
              onChange={e => setClientInfo({...clientInfo, phone: e.target.value})}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button onClick={() => setStep(2)} className="w-1/3 py-3 border border-slate-700 rounded-xl text-sm">Back</button>
            <button
              disabled={!clientInfo.name || !clientInfo.phone || isSubmitting}
              onClick={handleFinalSubmit}
              className="w-2/3 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-medium text-sm transition-all disabled:opacity-50"
            >
              {isSubmitting ? "Generating Scope of Work..." : "Generate Official SOW & Lock Deal"}
            </button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className="text-center py-6 space-y-5">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-2xl">
            ✓
          </div>
          <h2 className="text-2xl font-bold text-white">Scope of Work Generated!</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Aapka formal proposal ready hai. Project lock karne ke liye ₹5,000 booking token escrow mein add karein.
          </p>

          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl max-w-sm mx-auto text-left space-y-2 text-xs">
            <div className="flex justify-between"><span>Total Project Cost:</span><b className="text-white">₹{result.estimated_budget.toLocaleString("en-IN")}</b></div>
            <div className="flex justify-between"><span>Booking Token:</span><b className="text-emerald-400">₹{result.token_required.toLocaleString("en-IN")}</b></div>
            <div className="flex justify-between"><span>Status:</span><span className="text-indigo-400">{result.status}</span></div>
          </div>

          <div className="flex gap-4 max-w-sm mx-auto">
            <a href={result.proposal_pdf_url} target="_blank" rel="noreferrer" className="flex-1 py-2.5 border border-slate-700 rounded-xl text-xs flex items-center justify-center">
              Download SOW PDF
            </a>
            <button className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-semibold">
              Pay ₹5,000 via UPI
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
