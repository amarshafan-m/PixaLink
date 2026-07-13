import { useEffect, useState, useRef } from "react";
import { os, path, fs, https, http } from "../lib/cep/node";
import { csi, evalTS, subscribeBackgroundColor } from "../lib/utils/bolt";
import "./main.scss";

// Normalize path from file protocol
const normalizeCepPath = (value: string): string => {
  let cleaned = String(value || "");
  if (cleaned.indexOf("file://") === 0) {
    cleaned = decodeURIComponent(
      cleaned.replace(/^file:\/+/, os.platform() === "win32" ? "" : "/")
    );
  }
  return cleaned;
};

type Provider = "pixabay" | "pexels" | "freesound" | "giphy" | "coverr";
type Category = "all" | "photo" | "illustration" | "vector" | "video" | "music" | "sfx" | "gif";

interface NormalizedAsset {
  id: number | string;
  title: string;
  preview: string;
  meta: string;
  url: string;
  ext: string;
  provider: Provider;
  category: Category;
}

const licenseTerms: { [key in Provider]: { name: string; summary: string; url: string } } = {
  pixabay: {
    name: "Pixabay License",
    summary: "Free to use for commercial & personal projects. No attribution required.",
    url: "https://pixabay.com/service/license/"
  },
  pexels: {
    name: "Pexels License",
    summary: "Free to use. Attribution is not required. You can edit or modify.",
    url: "https://www.pexels.com/license/"
  },
  coverr: {
    name: "Coverr License",
    summary: "Free for commercial & non-commercial use. No attribution required.",
    url: "https://coverr.co/license"
  },
  freesound: {
    name: "Freesound Licenses",
    summary: "Licenses vary per track (CC0, CC-BY, CC-BY-NC). Check source sound page.",
    url: "https://freesound.org/help/faq/#licenses"
  },
  giphy: {
    name: "GIPHY Terms",
    summary: "For personal & non-commercial use. Commercial use requires GIPHY approval.",
    url: "https://giphy.com/terms"
  }
};

const categories = [
  { id: "all", label: "All" },
  { id: "photo", label: "Photo" },
  { id: "illustration", label: "Illustration" },
  { id: "vector", label: "Vector" },
  { id: "video", label: "Video" },
  { id: "music", label: "Music" },
  { id: "sfx", label: "SFX" },
  { id: "gif", label: "GIF" }
] as const;

const categoryFolderNames: { [key in Category]: string } = {
  all: "All",
  photo: "Photos",
  illustration: "Illustrations",
  vector: "Vectors",
  video: "Videos",
  music: "Music",
  sfx: "SFX",
  gif: "GIFs"
};

const categoryProviders: { [key in Category]: Provider[] } = {
  all: ["pixabay", "pexels", "coverr", "freesound", "giphy"],
  photo: ["pixabay", "pexels"],
  illustration: ["pixabay"],
  vector: ["pixabay"],
  video: ["pixabay", "pexels", "coverr"],
  music: [],
  sfx: ["freesound"],
  gif: ["pixabay", "giphy"]
};

const interleaveResults = (arrays: NormalizedAsset[][]): NormalizedAsset[] => {
  const interleaved: NormalizedAsset[] = [];
  const maxLen = Math.max(...arrays.map(arr => arr.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const arr of arrays) {
      if (i < arr.length) {
        interleaved.push(arr[i]);
      }
    }
  }
  return interleaved;
};

const nodeFetchStatus = (url: string, headers: any = {}): Promise<{ status: number; ok: boolean }> => {
  return new Promise((resolve) => {
    const client = url.indexOf("https:") === 0 ? https : http;
    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        ...headers
      }
    };
    const req = client.get(url, options, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.indexOf("/") === 0 && redirectUrl.indexOf("//") !== 0) {
          const origin = url.split("/").slice(0, 3).join("/");
          redirectUrl = origin + redirectUrl;
        }
        nodeFetchStatus(redirectUrl, headers).then(resolve);
        return;
      }
      resolve({
        status: res.statusCode || 500,
        ok: !!(res.statusCode && res.statusCode >= 200 && res.statusCode < 300)
      });
    });
    req.on("error", () => {
      resolve({ status: 500, ok: false });
    });
  });
};

const extensionFromUrl = (url: string, fallback: string): string => {
  const match = String(url || "").match(/\.(jpg|jpeg|png|webp|gif|svg)(?:\?|$)/i);
  return match ? `.${match[1].toLowerCase()}` : fallback;
};

// --- SVG Icons ---
const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const EyeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const EyeOffIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
);

const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
);

const PlayIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

const PauseIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16"></rect>
    <rect x="14" y="4" width="4" height="16"></rect>
  </svg>
);

const MusicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13"></path>
    <circle cx="6" cy="18" r="3"></circle>
    <circle cx="18" cy="16" r="3"></circle>
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "4px" }}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
    <polyline points="15 3 21 3 21 9"></polyline>
    <line x1="10" y1="14" x2="21" y2="3"></line>
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="chevron-down-select">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const AlertCircleIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="8" x2="12" y2="12"></line>
    <line x1="12" y1="16" x2="12.01" y2="16"></line>
  </svg>
);

// --- Reusable Custom Select Dropdown Component ---
interface CustomSelectProps {
  options: readonly Provider[] | Provider[];
  value: Provider;
  onChange: (value: Provider) => void;
}

const CustomSelect = ({ options, value, onChange }: CustomSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="custom-select" ref={selectRef}>
      <button
        type="button"
        className={`select-trigger ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{value.toUpperCase()}</span>
        <ChevronDownIcon />
      </button>
      {isOpen && (
        <div className="select-options">
          {options.map((option) => (
            <div
              key={option}
              className={`select-option ${option === value ? "active" : ""}`}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
            >
              {option.toUpperCase()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Compact Track Select Dropdown (same style as API dropdown) ---
interface TrackSelectProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

const TrackSelect = ({ options, value, onChange, compact }: TrackSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`track-select ${compact ? "compact" : ""}`} ref={selectRef}>
      <button
        type="button"
        className={`track-select-trigger ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{value}</span>
        <ChevronDownIcon />
      </button>
      {isOpen && (
        <div className="track-select-options">
          {options.map((opt) => (
            <div
              key={opt}
              className={`track-select-option ${opt === value ? "active" : ""}`}
              onClick={() => {
                onChange(opt);
                setIsOpen(false);
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const App = () => {
  const [bgColor, setBgColor] = useState("#191a1d");
  
  // API Keys state
  const [pixabayApiKey, setPixabayApiKey] = useState(() => localStorage.getItem("pixabayApiKey") || "");
  const [pexelsApiKey, setPexelsApiKey] = useState(() => localStorage.getItem("pexelsApiKey") || "");
  const [freesoundApiKey, setFreesoundApiKey] = useState(() => localStorage.getItem("freesoundApiKey") || "");
  const [giphyApiKey, setGiphyApiKey] = useState(() => localStorage.getItem("giphyApiKey") || "");
  const [coverrApiKey, setCoverrApiKey] = useState(() => localStorage.getItem("coverrApiKey") || "");

  // API Manager State
  const [showManageModal, setShowManageModal] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [selectedSetupProvider, setSelectedSetupProvider] = useState<Provider>("pixabay");
  const [setupKeyInput, setSetupKeyInput] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [showKeyText, setShowKeyText] = useState(false);

  // Custom Error Dialog Overlay State
  const [errorDialog, setErrorDialog] = useState<{ title: string; message: string } | null>(null);

  const [query, setQuery] = useState("");
  const [type, setType] = useState<Category>("all");
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [results, setResults] = useState<NormalizedAsset[]>([]);
  const [downloadingIds, setDownloadingIds] = useState<{ [id: string]: boolean }>({});
  const [downloadProgress, setDownloadProgress] = useState<{ [id: string]: number }>({});
  const [hoveredVideoId, setHoveredVideoId] = useState<string | number | null>(null);
  const [previewAsset, setPreviewAsset] = useState<NormalizedAsset | null>(null);

  // Track Selection State
  const [sequenceTracks, setSequenceTracks] = useState<{ video: string[]; audio: string[] }>({ video: [], audio: [] });
  const [globalVideoTrack, setGlobalVideoTrack] = useState<string>("V1");
  const [globalAudioTrack, setGlobalAudioTrack] = useState<string>("A1");
  const [cardTrackOverride, setCardTrackOverride] = useState<{ [id: string]: string }>({});

  // Licensing State
  const [isLicensed, setIsLicensed] = useState(() => !!localStorage.getItem("pixalink_license"));
  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [licenseError, setLicenseError] = useState("");
  
  // OTA Update State
  const [updateAvailable, setUpdateAvailable] = useState<{version: string, url: string} | null>(null);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);

  // Audio Playback State
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const providerKeys: { [key in Provider]: string } = {
    pixabay: pixabayApiKey,
    pexels: pexelsApiKey,
    freesound: freesoundApiKey,
    giphy: giphyApiKey,
    coverr: coverrApiKey
  };

  const configuredProviders = (["pixabay", "pexels", "freesound", "giphy", "coverr"] as Provider[]).filter(
    p => !!providerKeys[p]
  );
  
  const unconfiguredProviders = (["pixabay", "pexels", "freesound", "giphy", "coverr"] as Provider[]).filter(
    p => !providerKeys[p]
  );

  const hasAnyKey = configuredProviders.length > 0;

  // Auto select first unconfigured provider
  useEffect(() => {
    if (unconfiguredProviders.length > 0) {
      if (!unconfiguredProviders.includes(selectedSetupProvider)) {
        setSelectedSetupProvider(unconfiguredProviders[0]);
      }
    }
  }, [pixabayApiKey, pexelsApiKey, freesoundApiKey, giphyApiKey, coverrApiKey]);

  useEffect(() => {
    if (hasAnyKey) {
      setStatus(`Connected to: ${configuredProviders.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(", ")}.`);
      setIsError(false);
    } else {
      setStatus("Please configure at least one API key to start searching.");
      setIsError(true);
    }
  }, [pixabayApiKey, pexelsApiKey, freesoundApiKey, giphyApiKey, coverrApiKey]);

  useEffect(() => {
    if (window.cep) {
      subscribeBackgroundColor(setBgColor);
      checkForUpdates();
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Fetch enabled tracks from the active sequence
  const refreshSequenceTracks = async () => {
    try {
      const raw = await evalTS("getSequenceTracks");
      if (raw) {
        const parsed = JSON.parse(raw);
        setSequenceTracks(parsed);
        if (parsed.video.length > 0) setGlobalVideoTrack(parsed.video[0]);
        if (parsed.audio.length > 0) setGlobalAudioTrack(parsed.audio[0]);
      }
    } catch (_) {}
  };

  useEffect(() => {
    refreshSequenceTracks();
  }, []);

  const showError = (title: string, message: string) => {
    setErrorDialog({ title, message });
  };

  const checkForUpdates = async () => {
    try {
      const currentVersion = "1.0.0";
      const response = await fetch("https://raw.githubusercontent.com/Amar-Shafan/mock-repo/main/latest.json").catch(() => null);
      if (response && response.ok) {
        const data = await response.json();
        // Ensure there is actually a newer version before showing banner
        if (data.version && data.version > currentVersion) {
          setUpdateAvailable({ version: data.version, url: data.url });
        }
      }
    } catch (e) {}
  };

  const GUMROAD_PRODUCT_ID = "4BLlrpcgxi5Kc8luOtwemw=="; // Note: If API gives an error, replace this with the long internal ID from the Gumroad edit page URL.

  const handleActivateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    setLicenseError("");
    const code = licenseKeyInput.trim();
    if (!code) {
      setLicenseError("Please enter a valid license key.");
      return;
    }

    setIsActivating(true);
    try {
      const formData = new URLSearchParams();
      formData.append("product_id", GUMROAD_PRODUCT_ID);
      formData.append("license_key", code);
      // Optional: formData.append("increment_uses_count", "true");

      const response = await fetch("https://api.gumroad.com/v2/licenses/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData.toString()
      });

      const data = await response.json();

      if (data.success && data.purchase && !data.purchase.refunded && !data.purchase.chargebacked) {
        // Successfully validated active purchase
        localStorage.setItem("pixalink_license", code);
        setIsLicensed(true);
      } else {
        setLicenseError(data.message || "Invalid license key.");
      }
    } catch (err) {
      setLicenseError("Failed to connect to Gumroad license server.");
    } finally {
      setIsActivating(false);
    }
  };

  const handleStartUpdate = async () => {
    if (!updateAvailable) return;
    setIsDownloadingUpdate(true);
    // Real implementation would use node to download zip and extract
    try {
      for (let i = 0; i <= 100; i += 10) {
        setUpdateProgress(i);
        await new Promise(r => setTimeout(r, 200));
      }
      showError("Update Ready", "The update has been downloaded. Please restart Premiere Pro to apply the new version.");
      setUpdateAvailable(null);
    } catch (e) {
      showError("Update Failed", "Could not download the update.");
    } finally {
      setIsDownloadingUpdate(false);
      setUpdateProgress(0);
    }
  };

  const handlePlayAudio = (asset: NormalizedAsset) => {
    if (!asset.url) return;

    try {
      if (playingId === asset.id) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setPlayingId(null);
      } else {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        const audio = new Audio(asset.url);
        audio.addEventListener("ended", () => {
          setPlayingId(null);
        });
        audio.play().catch((err) => {
          showError("Audio Playback Failed", `Could not play preview track. Details: ${err.message || String(err)}`);
        });
        audioRef.current = audio;
        setPlayingId(String(asset.id));
      }
    } catch (err: any) {
      showError("Audio Playback Failed", `An unexpected error occurred during audio playback: ${err.message || String(err)}`);
    }
  };

  const validateApiKey = async (prov: Provider, key: string): Promise<{ ok: boolean; errorType?: string; errorMsg?: string }> => {
    let url = "";
    let headers: any = {};

    if (prov === "pixabay") {
      url = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=test&per_page=1`;
    } else if (prov === "pexels") {
      url = `https://api.pexels.com/v1/search?query=test&per_page=1`;
      headers = { Authorization: key };
    } else if (prov === "freesound") {
      url = `https://freesound.org/apiv2/search/text/?query=test&token=${encodeURIComponent(key)}&page_size=1`;
    } else if (prov === "giphy") {
      url = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=test&limit=1`;
    } else if (prov === "coverr") {
      url = `https://api.coverr.co/videos?api_key=${encodeURIComponent(key)}&query=test&page_size=1`;
    }

    try {
      const res = await nodeFetchStatus(url, headers);
      if (res.status === 401 || res.status === 403) {
        return { ok: false, errorType: "Invalid API Key", errorMsg: `The API key you entered for ${prov.toUpperCase()} is incorrect or has expired. Please copy the correct key from your provider's dashboard and try again.` };
      }
      return { ok: res.ok || res.status === 400 };
    } catch (e: any) {
      return { ok: false, errorType: "Connection Failed", errorMsg: "We couldn't reach the stock provider's servers. Please check your internet connection and try again." };
    }
  };

  const handleAddKey = async (prov: Provider, key: string) => {
    const cleanKey = key.trim();
    if (!cleanKey) return;

    setIsValidating(true);
    setStatus(`Validating key for ${prov.toUpperCase()}...`);
    setIsError(false);

    const validation = await validateApiKey(prov, cleanKey);
    setIsValidating(false);

    if (!validation.ok) {
      const title = validation.errorType || "API Key Validation Failed";
      const msg = validation.errorMsg || `The API key you provided for ${prov.toUpperCase()} is invalid. Please verify and try again.`;
      showError(title, msg);
      setStatus(`Failed to add key for ${prov.toUpperCase()}.`);
      setIsError(true);
      return;
    }

    if (prov === "pixabay") {
      setPixabayApiKey(cleanKey);
      localStorage.setItem("pixabayApiKey", cleanKey);
    } else if (prov === "pexels") {
      setPexelsApiKey(cleanKey);
      localStorage.setItem("pexelsApiKey", cleanKey);
    } else if (prov === "freesound") {
      setFreesoundApiKey(cleanKey);
      localStorage.setItem("freesoundApiKey", cleanKey);
    } else if (prov === "giphy") {
      setGiphyApiKey(cleanKey);
      localStorage.setItem("giphyApiKey", cleanKey);
    } else if (prov === "coverr") {
      setCoverrApiKey(cleanKey);
      localStorage.setItem("coverrApiKey", cleanKey);
    }

    setSetupKeyInput("");
    setStatus(`Successfully added key for ${prov.toUpperCase()}!`);
    setIsError(false);
  };

  const handleDeleteKey = (prov: Provider) => {
    if (prov === "pixabay") {
      setPixabayApiKey("");
      localStorage.removeItem("pixabayApiKey");
    } else if (prov === "pexels") {
      setPexelsApiKey("");
      localStorage.removeItem("pexelsApiKey");
    } else if (prov === "freesound") {
      setFreesoundApiKey("");
      localStorage.removeItem("freesoundApiKey");
    } else if (prov === "giphy") {
      setGiphyApiKey("");
      localStorage.removeItem("giphyApiKey");
    } else if (prov === "coverr") {
      setCoverrApiKey("");
      localStorage.removeItem("coverrApiKey");
    }
  };

  const fetchPixabay = async (q: string): Promise<NormalizedAsset[]> => {
    if (!pixabayApiKey) return [];
    if (type === "music" || type === "sfx") return [];

    const searchType = type === "all" ? "photo" : type;

    const params = [
      `key=${encodeURIComponent(pixabayApiKey)}`,
      `q=${encodeURIComponent(searchType === "gif" ? `${q} gif` : q)}`,
      "per_page=24",
      "safesearch=true",
    ];

    let url = "";
    if (searchType === "video") {
      url = `https://pixabay.com/api/videos/?${params.join("&")}`;
    } else {
      const imgType = searchType === "vector" ? "vector" : searchType === "illustration" ? "illustration" : "photo";
      params.push(`image_type=${encodeURIComponent(imgType)}`);
      url = `https://pixabay.com/api/?${params.join("&")}`;
    }

    const response = await fetch(url);
    if (response.status === 429) {
      throw new Error("RATE_LIMIT:Pixabay API rate limit reached.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("AUTH:Pixabay key is invalid or unauthorized.");
    }
    if (!response.ok) {
      throw new Error(`Pixabay returned HTTP ${response.status}`);
    }
    const data = await response.json();
    const hits = data.hits || [];
    return hits.map((hit: any) => normalizePixabayAsset(hit));
  };

  const fetchPexels = async (q: string): Promise<NormalizedAsset[]> => {
    if (!pexelsApiKey) return [];
    if (type !== "all" && type !== "photo" && type !== "video") return [];

    const searchType = type === "all" ? "photo" : type;

    const url = searchType === "video"
      ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=24`
      : `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=24`;

    const response = await fetch(url, {
      headers: {
        Authorization: pexelsApiKey
      }
    });

    if (response.status === 429) {
      throw new Error("RATE_LIMIT:Pexels API rate limit reached.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("AUTH:Pexels key is invalid or unauthorized.");
    }
    if (!response.ok) {
      throw new Error(`Pexels returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const hits = searchType === "video" ? data.videos || [] : data.photos || [];
    return hits.map((hit: any) => searchType === "video" ? normalizePexelsVideo(hit) : normalizePexelsPhoto(hit));
  };

  const fetchFreesound = async (q: string): Promise<NormalizedAsset[]> => {
    if (!freesoundApiKey) return [];
    if (type !== "all" && type !== "music" && type !== "sfx") return [];

    const url = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(q)}&fields=id,name,username,previews&token=${encodeURIComponent(freesoundApiKey)}&page_size=24`;
    const response = await fetch(url);
    
    if (response.status === 429) {
      throw new Error("RATE_LIMIT:Freesound API rate limit reached.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("AUTH:Freesound key is invalid or unauthorized.");
    }
    if (!response.ok) {
      throw new Error(`Freesound returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const results = data.results || [];
    return results.map((hit: any) => normalizeFreesoundAsset(hit));
  };

  const fetchGiphy = async (q: string): Promise<NormalizedAsset[]> => {
    if (!giphyApiKey) return [];
    if (type !== "all" && type !== "gif") return [];

    const url = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(giphyApiKey)}&q=${encodeURIComponent(q)}&limit=24`;
    const response = await fetch(url);
    
    if (response.status === 429) {
      throw new Error("RATE_LIMIT:GIPHY API rate limit reached.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("AUTH:GIPHY key is invalid or unauthorized.");
    }
    if (!response.ok) {
      throw new Error(`GIPHY returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const hits = data.data || [];
    return hits.map((hit: any) => normalizeGiphyAsset(hit));
  };

  const fetchCoverr = async (q: string): Promise<NormalizedAsset[]> => {
    if (!coverrApiKey) return [];
    if (type !== "all" && type !== "video") return [];

    const url = `https://api.coverr.co/videos?api_key=${encodeURIComponent(coverrApiKey)}&query=${encodeURIComponent(q)}&urls=true&page_size=24`;
    const response = await fetch(url);
    
    if (response.status === 429) {
      throw new Error("RATE_LIMIT:Coverr API rate limit reached.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("AUTH:Coverr key is invalid or unauthorized.");
    }
    if (!response.ok) {
      throw new Error(`Coverr returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const hits = data.hits || [];
    return hits.map((hit: any) => normalizeCoverrAsset(hit));
  };

  const search = async () => {
    const trimmedQuery = query.trim();
    const activeProviders = categoryProviders[type].filter(p => !!providerKeys[p]);

    if (activeProviders.length === 0) {
      const neededKeys = categoryProviders[type].map(p => p.toUpperCase()).join(" or ");
      setStatus(`Configure ${neededKeys} key in settings to search.`);
      setIsError(true);
      return;
    }

    if (!trimmedQuery) {
      setStatus("Type a search term first.");
      setIsError(true);
      return;
    }

    setStatus("Searching stock providers...");
    setIsError(false);
    setResults([]);

    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingId(null);

    const promises: Promise<
      | { status: "fulfilled"; value: NormalizedAsset[]; provider: Provider }
      | { status: "rejected"; reason: string; provider: Provider }
    >[] = [];

    activeProviders.forEach(p => {
      let call: Promise<NormalizedAsset[]> | null = null;
      if (p === "pixabay") call = fetchPixabay(trimmedQuery);
      if (p === "pexels") call = fetchPexels(trimmedQuery);
      if (p === "freesound") call = fetchFreesound(trimmedQuery);
      if (p === "giphy") call = fetchGiphy(trimmedQuery);
      if (p === "coverr") call = fetchCoverr(trimmedQuery);

      if (call) {
        promises.push(
          call
            .then(res => ({ status: "fulfilled" as const, value: res, provider: p }))
            .catch(err => ({ status: "rejected" as const, reason: err.message || String(err), provider: p }))
        );
      }
    });

    try {
      const outcome = await Promise.all(promises);
      
      let resultsByProvider: { [key in Provider]?: NormalizedAsset[] } = {};
      const errors: string[] = [];
      let rateLimitError: string | null = null;
      let authError: string | null = null;

      outcome.forEach(res => {
        if (res.status === "fulfilled") {
          resultsByProvider[res.provider] = res.value;
        } else {
          if (res.reason.indexOf("RATE_LIMIT:") === 0) {
            rateLimitError = res.reason.replace("RATE_LIMIT:", "");
          } else if (res.reason.indexOf("AUTH:") === 0) {
            authError = res.reason.replace("AUTH:", "");
          } else {
            errors.push(`${res.provider}: ${res.reason}`);
          }
        }
      });

      if (rateLimitError) {
        setResults([]);
        showError("Search Limit Reached", "You have made too many search requests. Please wait a minute before trying again.");
        setStatus("Search aborted due to rate limit.");
        setIsError(true);
        return;
      }

      if (authError) {
        setResults([]);
        showError("Incorrect API Key", "One of your saved API keys is incorrect or has expired. Please verify your keys in Settings.");
        setStatus("Search aborted due to invalid API key.");
        setIsError(true);
        return;
      }

      const arraysToInterleave = activeProviders.map(p => resultsByProvider[p] || []);
      const combined = interleaveResults(arraysToInterleave);
      setResults(combined);

      if (errors.length > 0 && combined.length === 0) {
        showError("Connection Failed", "We couldn't connect to the stock provider's servers. Please check your internet connection and try again.");
        setStatus("Search failed. Connection error.");
        setIsError(true);
      } else if (errors.length > 0) {
        setStatus(`Found ${combined.length} assets. (Some provider connections failed)`);
      } else if (combined.length === 0) {
        setStatus("No assets found for that search.");
      } else {
        const counts = activeProviders
          .map(p => {
            const count = (resultsByProvider[p] || []).length;
            return count > 0 ? `${count} ${p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()}` : "";
          })
          .filter(Boolean);
        setStatus(`Found ${combined.length} assets (${counts.join(", ")}).`);
      }
    } catch (err: any) {
      if (err.message && err.message.indexOf("RATE_LIMIT:") === 0) {
        setResults([]);
        showError("Search Limit Reached", "You have made too many search requests. Please wait a minute before trying again.");
        setStatus("Search aborted.");
        setIsError(true);
      } else {
        showError("Search Failed", "An unexpected problem occurred while searching. Please check your connection and try again.");
        setStatus("Search failed.");
        setIsError(true);
      }
    }
  };

  useEffect(() => {
    if (query.trim()) {
      search();
    }
  }, [type]);

  const normalizePixabayAsset = (hit: any): NormalizedAsset => {
    const isVideoType = type === "video" || (type === "all" && hit.duration);
    const assetCategory: Category = isVideoType
      ? "video"
      : type === "all"
      ? "photo"
      : type;

    if (isVideoType) {
      const video =
        hit.videos &&
        (hit.videos.large ||
          hit.videos.medium ||
          hit.videos.small ||
          hit.videos.tiny);
      return {
        id: `pixabay-${hit.id}`,
        title: hit.tags || "Pixabay video",
        preview: hit.picture_id
          ? `https://i.vimeocdn.com/video/${hit.picture_id}_295x166.jpg`
          : "",
        meta: [hit.duration ? `${hit.duration}s` : "video", hit.user]
          .filter(Boolean)
          .join(" · "),
        url: video ? video.url : "",
        ext: ".mp4",
        provider: "pixabay",
        category: assetCategory
      };
    }

    const imageUrl =
      type === "vector"
        ? hit.largeImageURL || hit.webformatURL || hit.vectorURL || ""
        : hit.largeImageURL || hit.fullHDURL || hit.webformatURL || "";

    return {
      id: `pixabay-${hit.id}`,
      title: hit.tags || "Pixabay image",
      preview: hit.previewURL || hit.webformatURL || "",
      meta: [
        hit.imageWidth && hit.imageHeight
          ? `${hit.imageWidth}x${hit.imageHeight}`
          : "image",
        hit.user,
      ]
        .filter(Boolean)
        .join(" · "),
      url: imageUrl,
      ext: extensionFromUrl(
        imageUrl,
        imageUrl === hit.vectorURL ? ".svg" : ".jpg"
      ),
      provider: "pixabay",
      category: assetCategory
    };
  };

  const normalizePexelsPhoto = (hit: any): NormalizedAsset => {
    const title = hit.alt || `Pexels Photo by ${hit.photographer}`;
    return {
      id: `pexels-${hit.id}`,
      title: title,
      preview: hit.src.medium,
      meta: `${hit.width}x${hit.height} · ${hit.photographer}`,
      url: hit.src.original,
      ext: extensionFromUrl(hit.src.original, ".jpg"),
      provider: "pexels",
      category: "photo"
    };
  };

  const normalizePexelsVideo = (hit: any): NormalizedAsset => {
    const file = hit.video_files.find((f: any) => f.quality === "hd" || f.quality === "sd") || hit.video_files[0];
    const preview = hit.image || (hit.video_pictures && hit.video_pictures[0]?.picture) || "";
    return {
      id: `pexels-${hit.id}`,
      title: `Pexels Video by ${hit.user?.name || "Pexels"}`,
      preview: preview,
      meta: `${hit.duration}s · ${hit.user?.name || "Pexels"}`,
      url: file ? file.link : "",
      ext: ".mp4",
      provider: "pexels",
      category: "video"
    };
  };

  const normalizeFreesoundAsset = (hit: any): NormalizedAsset => {
    const preview = hit.previews ? hit.previews["preview-hq-mp3"] || hit.previews["preview-lq-mp3"] || "" : "";
    return {
      id: `freesound-${hit.id}`,
      title: hit.name || "Freesound Audio",
      preview: "",
      meta: `audio · ${hit.username}`,
      url: preview,
      ext: ".mp3",
      provider: "freesound",
      category: "sfx"
    };
  };

  const normalizeGiphyAsset = (hit: any): NormalizedAsset => {
    return {
      id: `giphy-${hit.id}`,
      title: hit.title || "Giphy GIF",
      preview: hit.images?.fixed_width?.url || hit.images?.downsized?.url || "",
      meta: "gif · Giphy",
      url: hit.images?.original?.url || "",
      ext: ".gif",
      provider: "giphy",
      category: "gif"
    };
  };

  const normalizeCoverrAsset = (hit: any): NormalizedAsset => {
    const preview = hit.thumbnail || "";
    const downloadUrl = hit.urls?.mp4_download || hit.urls?.mp4 || "";
    return {
      id: `coverr-${hit.id}`,
      title: hit.title || "Coverr Video",
      preview: preview,
      meta: "video · Coverr",
      url: downloadUrl,
      ext: ".mp4",
      provider: "coverr",
      category: "video"
    };
  };

  const getAssetPath = async (asset: NormalizedAsset) => {
    let projectDir = "";
    try {
      projectDir = await evalTS("getProjectDirectory");
    } catch (e) {
      // ignore
    }

    let rootPath = projectDir;
    if (!rootPath) {
      rootPath = csi.getSystemPath("myDocuments");
      if (!rootPath || rootPath === "invalidParam") {
        rootPath = os.homedir();
      }
    }
    const cleanRoot = normalizeCepPath(rootPath);
    
    const providerFolder = asset.provider.charAt(0).toUpperCase() + asset.provider.slice(1);
    const categoryFolder = categoryFolderNames[asset.category];
    const destinationDir = path.join(cleanRoot, "PixaLinkAssets", providerFolder, categoryFolder);
    
    try {
      if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir, { recursive: true });
      }
    } catch (e: any) {
      throw new Error(`FS:Could not create download folder: ${e.message || String(e)}`);
    }
    
    const safeTitle = (asset.title || "pixalink-asset")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64);

    const baseName = `${safeTitle}-${asset.id}`;
    let finalPath = path.join(destinationDir, `${baseName}${asset.ext}`);
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      finalPath = path.join(destinationDir, `${baseName}-${counter}${asset.ext}`);
      counter++;
    }
    return finalPath;
  };

  const downloadToFile = (
    url: string,
    destination: string,
    onProgress: (percent: number) => void
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const client = url.indexOf("https:") === 0 ? https : http;
      let file: any = null;
      try {
        file = fs.createWriteStream(destination);
      } catch (err: any) {
        reject(new Error(`FS:Permission denied or write block on local path: ${err.message || String(err)}`));
        return;
      }

      const request = client.get(url, (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          file.close();
          fs.unlink(destination, () => {});
          downloadToFile(response.headers.location, destination, onProgress)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (response.statusCode === 429) {
          file.close();
          fs.unlink(destination, () => {});
          reject(new Error(`RATE_LIMIT:You've made too many requests to this provider. Please wait a moment and try again.`));
          return;
        }
        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(destination, () => {});
          reject(new Error(`Download connection failed: HTTP ${response.statusCode}`));
          return;
        }

        const total = parseInt(response.headers["content-length"] || "0", 10);
        let loaded = 0;

        file.on("error", (err: any) => {
          file.close();
          fs.unlink(destination, () => {});
          reject(new Error(`FS:Failed writing to file: ${err.message || String(err)}`));
        });

        response.on("data", (chunk) => {
          loaded += chunk.length;
          if (total > 0) {
            const percent = Math.round((loaded / total) * 100);
            onProgress(percent);
          }
        });

        response.pipe(file);
        file.on("finish", () => {
          file.close(() => resolve());
        });
      });

      request.on("error", (error) => {
        if (file) file.close();
        fs.unlink(destination, () => {});
        reject(new Error(`Network timeout or connection reset during download: ${error.message || String(error)}`));
      });
    });
  };

  const importIntoPremiere = async (filePath: string, track: string) => {
    const result = await evalTS("importToTimeline", filePath, track);
    if (result.indexOf("ERROR:") === 0) {
      throw new Error(result.replace("ERROR:", ""));
    }
    return result;
  };

  const handleDownload = async (asset: NormalizedAsset, shouldImport: boolean, trackOverride?: string) => {
    if (!asset.url) {
      showError("Download Blocked", "This asset does not provide a downloadable URL.");
      setStatus("Download failed.");
      setIsError(true);
      return;
    }

    const isAudioAsset = asset.provider === "freesound";
    const resolvedTrack = trackOverride
      ?? cardTrackOverride[String(asset.id)]
      ?? (isAudioAsset ? globalAudioTrack : globalVideoTrack);

    if (shouldImport) {
      try {
        const hasSeq = await evalTS("hasActiveSequence");
        if (!hasSeq) {
          showError("Import Blocked", "Please create or open a sequence/timeline in Premiere Pro before importing assets.");
          setStatus("Import failed.");
          setIsError(true);
          return;
        }

        const isLocked = await evalTS("isTrackLocked", resolvedTrack);
        if (isLocked) {
          showError("Import Blocked", `The targeted track (${resolvedTrack}) is locked in Premiere Pro. Please unlock it and try again.`);
          setStatus("Import failed.");
          setIsError(true);
          return;
        }
      } catch (err) {
        // Fallback if extendscript check fails
      }
    }

    setDownloadingIds((prev) => ({ ...prev, [asset.id]: true }));
    setDownloadProgress((prev) => ({ ...prev, [asset.id]: 0 }));
    setStatus("Downloading asset...");
    setIsError(false);

    try {
      const destination = await getAssetPath(asset);
      await downloadToFile(asset.url, destination, (percent) => {
        setDownloadProgress((prev) => ({ ...prev, [asset.id]: percent }));
      });

      if (!shouldImport) {
        setStatus(`Downloaded to: ${destination}`);
        return;
      }

      setStatus("Importing into Premiere Pro...");
      try {
        const message = await importIntoPremiere(destination, resolvedTrack);
        setStatus(message || "Imported into Premiere Pro.");
      } catch (impErr: any) {
        const errMsg = impErr.message || String(impErr);
        if (errMsg.includes("locked")) {
           showError("Import Blocked", errMsg);
        } else {
           showError("Import Blocked", errMsg || "Please create or open a sequence/timeline in Premiere Pro before importing assets.");
        }
        setStatus("Import failed.");
        setIsError(true);
      }
    } catch (error: any) {
      if (error.message && error.message.indexOf("FS:") === 0) {
        showError("Unable to Save File", `We couldn't save this asset to your storage path. Details: ${error.message.replace("FS:", "")}`);
      } else if (error.message && error.message.indexOf("RATE_LIMIT:") === 0) {
        showError("Too Many Requests", error.message.replace("RATE_LIMIT:", "").trim());
      } else {
        showError("Download Interrupted", `The download connection failed. Details: ${error.message || String(error)}`);
      }
      setStatus("Download failed.");
      setIsError(true);
    } finally {
      setDownloadingIds((prev) => ({ ...prev, [asset.id]: false }));
      setDownloadProgress((prev) => {
        const copy = { ...prev };
        delete copy[asset.id];
        return copy;
      });
    }
  };

  // 0. Licensing Screen
  if (!isLicensed) {
    return (
      <div className="pixalink-app welcome-screen" style={{ backgroundColor: bgColor }}>
        <div className="welcome-card card">
          <div className="welcome-header">
            <h1>PixaLink</h1>
            <p>Enter your Gumroad license key to activate</p>
          </div>
          <form className="setup-form" onSubmit={handleActivateLicense}>
            <div className="key-field">
              <label>License Key</label>
              <input 
                type="text" 
                placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                value={licenseKeyInput}
                onChange={e => setLicenseKeyInput(e.target.value)}
                disabled={isActivating}
              />
            </div>
            {licenseError && <p className="error-text" style={{color: "#ef4444", fontSize: "12px", marginTop: "4px"}}>{licenseError}</p>}
            <button type="submit" className="primary" disabled={isActivating || !licenseKeyInput} style={{ marginTop: "16px", width: "100%" }}>
              {isActivating ? "Activating..." : "Activate PixaLink"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 1. Initial Setup Onboarding (No Configured APIs)
  if (!hasAnyKey) {
    return (
      <div className="pixalink-app welcome-screen" style={{ backgroundColor: bgColor }}>
        {/* Custom Error Dialog Overlay inside onboarding */}
        {errorDialog && (
          <div className="modal-overlay error-dialog-overlay">
            <div className="modal-content card error-dialog-content">
              <div className="modal-header">
                <h2>{errorDialog.title}</h2>
                <button className="close-modal-btn" onClick={() => setErrorDialog(null)}>✕</button>
              </div>
              <div className="modal-body error-dialog-body">
                <div className="error-icon-wrapper">
                  <AlertCircleIcon />
                </div>
                <p>{errorDialog.message}</p>
              </div>
              <button className="primary close-error-btn" onClick={() => setErrorDialog(null)} style={{ marginTop: "12px", width: "100%" }}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="welcome-card card">
          <div className="welcome-header">
            <h1>PixaLink</h1>
            <p>Connect your API keys to get started</p>
          </div>
          
          <div className="setup-form">
            <div className="key-field">
              <label htmlFor="setupProviderSelect">Select Provider</label>
              <CustomSelect
                options={unconfiguredProviders}
                value={selectedSetupProvider}
                onChange={(val) => {
                  setSelectedSetupProvider(val);
                  setShowKeyText(false);
                }}
              />
            </div>

            <div className="key-field" style={{ marginTop: "12px" }}>
              <label htmlFor="setupKeyInput">API Key</label>
              <div className="password-input-container">
                <input
                  id="setupKeyInput"
                  type={showKeyText ? "text" : "password"}
                  placeholder={`Paste your ${selectedSetupProvider.toUpperCase()} API key...`}
                  value={setupKeyInput}
                  onChange={(e) => setSetupKeyInput(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowKeyText(!showKeyText)}
                  title={showKeyText ? "Hide key" : "Show key"}
                >
                  {showKeyText ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <button
              className="primary save-all-button"
              disabled={!setupKeyInput.trim() || isValidating}
              onClick={() => handleAddKey(selectedSetupProvider, setupKeyInput)}
              style={{ marginTop: "14px", width: "100%" }}
            >
              {isValidating ? "Validating..." : "+ Add API Provider"}
            </button>

            {/* License Terms Summary */}
            <div className="setup-license-info card" style={{ marginTop: "14px" }}>
              <h4>{licenseTerms[selectedSetupProvider].name}</h4>
              <p>{licenseTerms[selectedSetupProvider].summary}</p>
              <a
                href={licenseTerms[selectedSetupProvider].url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  csi.openURLInDefaultBrowser(licenseTerms[selectedSetupProvider].url);
                }}
              >
                Terms & Conditions <ExternalLinkIcon />
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Main Stock Importer Search UI
  return (
    <div className="pixalink-app" style={{ backgroundColor: bgColor }}>
      
      {/* OTA Update Banner */}
      {updateAvailable && (
        <div className="ota-update-banner card" style={{ margin: "12px 12px 0 12px", padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid rgba(60, 174, 163, 0.4)", backgroundColor: "rgba(60, 174, 163, 0.1)" }}>
          <div>
            <h4 style={{ margin: 0, color: "#3caea3", fontSize: "12px" }}>Update Available (v{updateAvailable.version})</h4>
            <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "#cbd5e1" }}>
              {isDownloadingUpdate ? `Downloading... ${updateProgress}%` : "A new version of PixaLink is ready."}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {!isDownloadingUpdate && <button className="secondary" onClick={() => setUpdateAvailable(null)} style={{ padding: "6px 10px", fontSize: "11px" }}>Later</button>}
            <button className="primary" onClick={handleStartUpdate} disabled={isDownloadingUpdate} style={{ padding: "6px 10px", fontSize: "11px" }}>
              {isDownloadingUpdate ? "Downloading..." : "Update Now"}
            </button>
          </div>
        </div>
      )}

      {/* Custom Error Dialog Overlay inside main search UI */}
      {errorDialog && (
        <div className="modal-overlay error-dialog-overlay">
          <div className="modal-content card error-dialog-content">
            <div className="modal-header">
              <h2>{errorDialog.title}</h2>
              <button className="close-modal-btn" onClick={() => setErrorDialog(null)}>✕</button>
            </div>
            <div className="modal-body error-dialog-body">
              <div className="error-icon-wrapper">
                <AlertCircleIcon />
              </div>
              <p>{errorDialog.message}</p>
            </div>
            <button className="primary close-error-btn" onClick={() => setErrorDialog(null)} style={{ marginTop: "12px", width: "100%" }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="topbar">
        <div>
          <h1>PixaLink</h1>
          <p>Multi-Provider Stock Importer</p>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            className="add-new-provider-btn pro-btn"
            onClick={() => setShowLicenseModal(true)}
            title="License Info"
          >
            PRO
          </button>
          <button
            className="add-new-provider-btn"
            onClick={() => setShowManageModal(true)}
            title="Manage API Providers"
          >
            + Add New
          </button>
        </div>
      </div>

      {/* License Management Modal */}
      {showLicenseModal && (
        <div className="modal-overlay">
          <div className="modal-content card" style={{ maxWidth: "320px" }}>
            <div className="modal-header">
              <h2>License Information</h2>
              <button className="close-modal-btn" onClick={() => setShowLicenseModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="configured-item card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3caea3" }}></div>
                  <span style={{ color: "#f1f5f9", fontSize: "14px", fontWeight: 700 }}>Pro License Active</span>
                </div>
                <div>
                  <p style={{ color: "#94a3b8", fontSize: "11px", margin: "0 0 4px 0" }}>License Key</p>
                  <p style={{ color: "#cbd5e1", fontSize: "12px", margin: 0, fontFamily: "monospace", background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: "4px" }}>
                    {localStorage.getItem("pixalink_license")?.substring(0, 8)}••••••••••••
                  </p>
                </div>
                <button 
                  className="secondary" 
                  style={{ width: "100%", fontSize: "12px", padding: "8px", borderColor: "rgba(239, 68, 68, 0.4)", color: "#ef4444", marginTop: "8px" }}
                  onClick={() => {
                    localStorage.removeItem("pixalink_license");
                    setIsLicensed(false);
                    setShowLicenseModal(false);
                  }}
                >
                  Deactivate License
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Key Management Overlay Dialog */}
      {showManageModal && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <div className="modal-header">
              <h2>Manage Providers</h2>
              <button className="close-modal-btn" onClick={() => { setShowManageModal(false); setShowKeyText(false); }}>✕</button>
            </div>

            <div className="modal-body">
              {/* List Configured Keys */}
              <div className="configured-keys-list">
                <h3>Configured Providers</h3>
                {configuredProviders.map(p => (
                  <div key={p} className="configured-item card">
                    <div className="item-main">
                      <span className="item-name">{p.toUpperCase()}</span>
                      <span className="item-mask">••••••••</span>
                      <button className="delete-key-btn" onClick={() => handleDeleteKey(p)} title="Remove Provider">
                        <TrashIcon />
                      </button>
                    </div>
                    {/* License Info in Modal */}
                    <div className="license-info-row">
                      <p>{licenseTerms[p].summary}</p>
                      <a
                        href={licenseTerms[p].url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          e.preventDefault();
                          csi.openURLInDefaultBrowser(licenseTerms[p].url);
                        }}
                      >
                        Terms <ExternalLinkIcon />
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add New Key Form */}
              {unconfiguredProviders.length > 0 ? (
                <div className="add-new-provider-section" style={{ marginTop: "12px" }}>
                  <h3>Add Provider</h3>
                  <div className="key-field">
                    <CustomSelect
                      options={unconfiguredProviders}
                      value={selectedSetupProvider}
                      onChange={(val) => {
                        setSelectedSetupProvider(val);
                        setShowKeyText(false);
                      }}
                    />
                  </div>
                  <div className="key-field" style={{ marginTop: "6px" }}>
                    <div className="password-input-container">
                      <input
                        type={showKeyText ? "text" : "password"}
                        placeholder="Paste API key..."
                        value={setupKeyInput}
                        onChange={(e) => setSetupKeyInput(e.target.value)}
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowKeyText(!showKeyText)}
                        title={showKeyText ? "Hide key" : "Show key"}
                      >
                        {showKeyText ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                  <button
                    className="primary"
                    disabled={!setupKeyInput.trim() || isValidating}
                    onClick={() => handleAddKey(selectedSetupProvider, setupKeyInput)}
                    style={{ marginTop: "8px", width: "100%" }}
                  >
                    {isValidating ? "Validating..." : "+ Add Key"}
                  </button>

                  <div className="modal-license-preview card" style={{ marginTop: "8px" }}>
                    <h4>{licenseTerms[selectedSetupProvider].name}</h4>
                    <p>{licenseTerms[selectedSetupProvider].summary}</p>
                  </div>
                </div>
              ) : (
                <p className="all-configured-msg">All providers are currently configured.</p>
              )}
              {/* API Documentation Reference */}
              <div className="api-documentation-section" style={{ marginTop: "16px", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "12px" }}>
                <h3>API Documentation Links</h3>
                <div className="docs-links-grid">
                  <a href="https://pixabay.com/api/docs/" onClick={(e) => { e.preventDefault(); csi.openURLInDefaultBrowser("https://pixabay.com/api/docs/"); }}>Pixabay API</a>
                  <a href="https://www.pexels.com/api/documentation/" onClick={(e) => { e.preventDefault(); csi.openURLInDefaultBrowser("https://www.pexels.com/api/documentation/"); }}>Pexels API</a>
                  <a href="https://coverr.co/developers" onClick={(e) => { e.preventDefault(); csi.openURLInDefaultBrowser("https://coverr.co/developers"); }}>Coverr API</a>
                  <a href="https://developers.giphy.com/docs/api/" onClick={(e) => { e.preventDefault(); csi.openURLInDefaultBrowser("https://developers.giphy.com/docs/api/"); }}>GIPHY API</a>
                  <a href="https://freesound.org/docs/api/" onClick={(e) => { e.preventDefault(); csi.openURLInDefaultBrowser("https://freesound.org/docs/api/"); }}>Freesound API</a>
                </div>
              </div>
            </div>

            <button className="primary close-modal-action-btn" onClick={() => { setShowManageModal(false); setShowKeyText(false); }} style={{ marginTop: "14px", width: "100%" }}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* Asset Preview Lightbox */}
      {previewAsset && (
        <div className="video-lightbox-overlay" onClick={() => setPreviewAsset(null)}>
          <div className="video-lightbox-box" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close-btn" onClick={() => setPreviewAsset(null)}>✕</button>
            <div className="lightbox-video-wrap">
              {previewAsset.category === "video" && previewAsset.url ? (
                <video
                  src={previewAsset.url}
                  autoPlay
                  muted={false}
                  controls
                  loop
                  playsInline
                  className="lightbox-video"
                />
              ) : previewAsset.url && previewAsset.ext === ".gif" ? (
                <img src={previewAsset.url} alt={previewAsset.title} className="lightbox-video" />
              ) : previewAsset.preview ? (
                <img src={previewAsset.preview} alt={previewAsset.title} className="lightbox-video" />
              ) : null}
            </div>
            <div className="lightbox-meta">
              <div className="lightbox-meta-left">
                <span className="lightbox-title">{previewAsset.title}</span>
                <div className="lightbox-type-row">
                  {type === "all" && (
                    <span className={`type-badge type-${previewAsset.category}`}>
                      {previewAsset.category === "video" ? "Video"
                        : previewAsset.category === "photo" ? "Photo"
                        : previewAsset.category === "gif" ? "GIF"
                        : previewAsset.category === "vector" ? "Vector"
                        : previewAsset.category === "illustration" ? "Illustration"
                        : previewAsset.category === "music" ? "Music"
                        : previewAsset.category === "sfx" ? "SFX"
                        : previewAsset.category}
                    </span>
                  )}
                  <span className="lightbox-category">{previewAsset.meta}</span>
                </div>
              </div>
              <div className="lightbox-meta-right">
                <span className={`provider-badge ${previewAsset.provider}`}>
                  {previewAsset.provider === "pixabay" ? "Pixabay" : previewAsset.provider === "pexels" ? "Pexels" : previewAsset.provider === "coverr" ? "Coverr" : previewAsset.provider === "giphy" ? "Giphy" : "Freesound"}
                </span>
                
                {/* Lightbox Track Override */}
                {previewAsset.provider === "freesound" ? (
                  sequenceTracks.audio.length > 0 && (
                    <div className="card-track-pair">
                      <span className="card-track-label">A</span>
                      <TrackSelect
                        compact
                        options={sequenceTracks.audio}
                        value={cardTrackOverride[String(previewAsset.id)] ?? globalAudioTrack}
                        onChange={(v) => setCardTrackOverride(prev => ({ ...prev, [String(previewAsset.id)]: v }))}
                      />
                    </div>
                  )
                ) : (
                  sequenceTracks.video.length > 0 && (
                    <div className="card-track-pair">
                      <span className="card-track-label">V</span>
                      <TrackSelect
                        compact
                        options={sequenceTracks.video}
                        value={cardTrackOverride[String(previewAsset.id)] ?? globalVideoTrack}
                        onChange={(v) => setCardTrackOverride(prev => ({ ...prev, [String(previewAsset.id)]: v }))}
                      />
                    </div>
                  )
                )}

                <button
                  className="primary lightbox-import-btn"
                  disabled={!!downloadingIds[previewAsset.id]}
                  onClick={() => { handleDownload(previewAsset!, true); setPreviewAsset(null); }}
                >
                  {downloadingIds[previewAsset.id] ? "Importing..." : "Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search inputs bar */}
      <div className="search-section card">
        <div className="search-row">
          <input
            type="text"
            placeholder="Search stock assets..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button className="primary search-btn" onClick={search}>
            <SearchIcon />
            <span>Search</span>
          </button>
        </div>

        <div className="filters">
          {categories.map((category) => {
            const isSupportedByAnyKey = categoryProviders[category.id].some(p => !!providerKeys[p]);
            return (
              <button
                key={category.id}
                disabled={!isSupportedByAnyKey}
                className={`filter ${type === category.id ? "active" : ""}`}
                onClick={() => setType(category.id)}
              >
                {category.label}
              </button>
            );
          })}
        </div>

        {/* Track target row — separate from search */}
        {(sequenceTracks.video.length > 0 || sequenceTracks.audio.length > 0) && (
          <div className="track-target-row">
            <span className="track-target-label">Import to:</span>
            {sequenceTracks.video.length > 0 && (
              <div className="track-pick">
                <span className="track-pick-prefix">Video</span>
                <TrackSelect
                  options={sequenceTracks.video}
                  value={globalVideoTrack}
                  onChange={(v) => setGlobalVideoTrack(v)}
                />
              </div>
            )}
            {sequenceTracks.audio.length > 0 && (
              <div className="track-pick">
                <span className="track-pick-prefix">Audio</span>
                <TrackSelect
                  options={sequenceTracks.audio}
                  value={globalAudioTrack}
                  onChange={(v) => setGlobalAudioTrack(v)}
                />
              </div>
            )}
            <button className="refresh-tracks-btn" onClick={refreshSequenceTracks} title="Refresh tracks">↻</button>
          </div>
        )}
      </div>

      <div className={`status-bar card ${isError ? "error" : ""}`}>
        {status}
      </div>

      <div className="results-container">
        {results.map((hit) => {
          const isDownloading = downloadingIds[hit.id];
          const isAudio = hit.provider === "freesound";
          const isPlaying = playingId === hit.id;
          const isVideo = hit.category === "video";
          const isHovered = hoveredVideoId === hit.id;
          const typeLabel = hit.category === "video" ? "Video"
            : hit.category === "photo" ? "Photo"
            : hit.category === "gif" ? "GIF"
            : hit.category === "vector" ? "Vector"
            : hit.category === "illustration" ? "Illustration"
            : hit.category === "music" ? "Music"
            : hit.category === "sfx" ? "SFX"
            : hit.category;

          return (
            <article key={hit.id} className="asset-card card">
              <div className="thumb-container">
                {isAudio ? (
                  <div className="audio-card-thumb" onClick={() => handlePlayAudio(hit)}>
                    <div className="music-icon-wrapper">
                      <MusicIcon />
                    </div>
                    <div className={`waveform-bars ${isPlaying ? "playing" : ""}`}>
                      <div className="bar"></div>
                      <div className="bar"></div>
                      <div className="bar"></div>
                      <div className="bar"></div>
                      <div className="bar"></div>
                    </div>
                    <div className="audio-play-overlay">
                      {isPlaying ? <PauseIcon /> : <PlayIcon />}
                    </div>
                  </div>
                ) : isVideo ? (
                  <div
                    className="video-preview-wrapper"
                    onMouseEnter={() => setHoveredVideoId(hit.id)}
                    onMouseLeave={() => setHoveredVideoId(null)}
                    onClick={() => setPreviewAsset(hit)}
                    title="Click to preview"
                  >
                    {hit.preview ? (
                      <img className="thumb" src={hit.preview} alt="" />
                    ) : (
                      <div className="thumb-placeholder">No Preview</div>
                    )}
                    {isHovered && hit.url && (
                      <video
                        className="thumb video-player"
                        src={hit.url}
                        autoPlay
                        muted
                        loop
                        playsInline
                      />
                    )}
                  </div>
                ) : hit.preview ? (
                  <img
                    className="thumb"
                    src={hit.preview}
                    alt=""
                    onClick={() => setPreviewAsset(hit)}
                    style={{ cursor: "pointer" }}
                    title="Click to preview"
                  />
                ) : (
                  <div className="thumb-placeholder">No Preview</div>
                )}

                {/* Animated Circular Download Preloader */}
                {isDownloading && (
                  <div className="downloading-overlay">
                    <div className="spinner"></div>
                    <span className="progress-percent">
                      {downloadProgress[hit.id] !== undefined ? `${downloadProgress[hit.id]}%` : "0%"}
                    </span>
                  </div>
                )}

                {/* Type Badge — top left */}
                {type === "all" && <span className={`type-badge type-${hit.category}`}>{typeLabel}</span>}

                {/* Source Badge — bottom right */}
                <span className={`provider-badge ${hit.provider}`}>
                  {hit.provider === "pixabay"
                    ? "Pixabay"
                    : hit.provider === "pexels"
                    ? "Pexels"
                    : hit.provider === "freesound"
                    ? "Freesound"
                    : hit.provider === "giphy"
                    ? "Giphy"
                    : "Coverr"}
                </span>
              </div>
              <div className="asset-info">
                <h2>{hit.title}</h2>
                <div className="asset-meta">{hit.meta}</div>
                <div className="asset-actions">
                  {/* Per-card track override selectors */}
                  {isAudio ? (
                    sequenceTracks.audio.length > 0 && (
                      <div className="card-track-pair">
                        <span className="card-track-label">A</span>
                        <TrackSelect
                          compact
                          options={sequenceTracks.audio}
                          value={cardTrackOverride[String(hit.id)] ?? globalAudioTrack}
                          onChange={(v) => setCardTrackOverride(prev => ({ ...prev, [String(hit.id)]: v }))}
                        />
                      </div>
                    )
                  ) : (
                    sequenceTracks.video.length > 0 && (
                      <div className="card-track-pair">
                        <span className="card-track-label">V</span>
                        <TrackSelect
                          compact
                          options={sequenceTracks.video}
                          value={cardTrackOverride[String(hit.id)] ?? globalVideoTrack}
                          onChange={(v) => setCardTrackOverride(prev => ({ ...prev, [String(hit.id)]: v }))}
                        />
                      </div>
                    )
                  )}
                  <button
                    className="primary"
                    disabled={isDownloading}
                    onClick={() => handleDownload(hit, true)}
                  >
                    {isDownloading ? "Importing..." : "Import"}
                  </button>

                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
