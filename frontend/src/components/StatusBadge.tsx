interface Props { connected: boolean; }

export function StatusBadge({ connected }: Props) {
  return (
    <div className="flex items-center gap-3">
      {/* Network pill */}
      <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                        bg-cyber-deep border border-cyber-border text-[10px] font-mono
                        text-cyber-muted uppercase tracking-widest">
        CASPER TESTNET
      </span>

      {/* Live indicator */}
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-widest transition-all duration-500"
        style={connected ? {
          background:   "rgba(0,255,148,0.06)",
          borderColor:  "rgba(0,255,148,0.3)",
          color:        "#00FF94",
          boxShadow:    "0 0 12px rgba(0,255,148,0.15)",
        } : {
          background:   "rgba(255,45,85,0.06)",
          borderColor:  "rgba(255,45,85,0.3)",
          color:        "#FF2D55",
        }}
      >
        <span className="relative flex h-1.5 w-1.5">
          {connected && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                  style={{ backgroundColor: "#00FF94" }} />
          )}
          <span className="relative inline-flex rounded-full h-1.5 w-1.5"
                style={{ backgroundColor: connected ? "#00FF94" : "#FF2D55" }} />
        </span>
        {connected ? "NEURAL LINK ACTIVE" : "OFFLINE"}
      </span>
    </div>
  );
}
