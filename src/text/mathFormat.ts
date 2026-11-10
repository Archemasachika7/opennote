const SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε",
  zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ",
  mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ",
  upsilon: "υ", phi: "φ", varphi: "ϕ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
  Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  infty: "∞", partial: "∂", nabla: "∇", int: "∫", iint: "∬", oint: "∮",
  sum: "∑", prod: "∏", pm: "±", mp: "∓", times: "×", cdot: "·", div: "÷",
  le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈",
  equiv: "≡", sim: "∼", propto: "∝", in: "∈", notin: "∉", subset: "⊂",
  subseteq: "⊆", cup: "∪", cap: "∩", emptyset: "∅", forall: "∀", exists: "∃",
  neg: "¬", land: "∧", lor: "∨", to: "→", rightarrow: "→", leftarrow: "←",
  leftrightarrow: "↔", Rightarrow: "⇒", Leftarrow: "⇐", iff: "⇔",
  therefore: "∴", because: "∵", degree: "°", hbar: "ℏ", ell: "ℓ",
  Re: "ℜ", Im: "ℑ", N: "ℕ", Z: "ℤ", Q: "ℚ", R: "ℝ", C: "ℂ",
};

const SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  "a": "ᵃ", "b": "ᵇ", "c": "ᶜ", "d": "ᵈ", "e": "ᵉ", "f": "ᶠ", "g": "ᵍ", "h": "ʰ", "i": "ⁱ", "j": "ʲ",
  "k": "ᵏ", "l": "ˡ", "m": "ᵐ", "n": "ⁿ", "o": "ᵒ", "p": "ᵖ", "r": "ʳ", "s": "ˢ", "t": "ᵗ", "u": "ᵘ",
  "v": "ᵛ", "w": "ʷ", "x": "ˣ", "y": "ʸ", "z": "ᶻ", "T": "ᵀ",
};

const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  "a": "ₐ", "e": "ₑ", "h": "ₕ", "i": "ᵢ", "j": "ⱼ", "k": "ₖ", "l": "ₗ", "m": "ₘ", "n": "ₙ",
  "o": "ₒ", "p": "ₚ", "r": "ᵣ", "s": "ₛ", "t": "ₜ", "u": "ᵤ", "v": "ᵥ", "x": "ₓ",
};

function mapScript(str: string, table: Record<string, string>, fallbackPrefix: string): string {
  const chars = [...str];
  if (chars.every((ch) => ch in table)) return chars.map((ch) => table[ch]).join("");
  return `${fallbackPrefix}(${str})`;
}

/**
 * Pure offline LaTeX-to-Unicode scientific equation typesetter.
 * Converts standard LaTeX snippets into clean mathematical Unicode text that renders offline,
 * indexes in search, and exports cleanly to PDF without external fonts or network calls.
 */
export function formatLatexMath(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  // Strip outer $...$ or $$...$$ if typed by user
  s = s.replace(/^\$\$([\s\S]*)\$\$$/, "$1").replace(/^\$([\s\S]*)\$$/, "$1").trim();

  // Handle \text{...}
  s = s.replace(/\\text\{([^{}]*)\}/g, "$1");
  // Handle \vec{x} and \hat{x} and \bar{x}
  s = s.replace(/\\vec\{([^{}])\}/g, "$1\u20D7");
  s = s.replace(/\\hat\{([^{}])\}/g, "$1\u0302");
  s = s.replace(/\\bar\{([^{}])\}/g, "$1\u0304");

  // Handle nested \sqrt{...} and \sqrt[n]{...}
  for (let pass = 0; pass < 3; pass++) {
    s = s.replace(/\\sqrt\[([^{}\]]+)\]\{([^{}]*)\}/g, (_, root: string, body: string) => {
      const r = formatLatexMath(root);
      const b = formatLatexMath(body);
      if (r === "3") return `∛(${b})`;
      if (r === "4") return `∜(${b})`;
      return `${mapScript(r, SUP, "^")}√(${b})`;
    });
    s = s.replace(/\\sqrt\{([^{}]*)\}/g, (_, body: string) => {
      const b = formatLatexMath(body);
      return b.length <= 2 ? `√${b}` : `√(${b})`;
    });
    // Handle \frac{a}{b}
    s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, num: string, den: string) => {
      const n = formatLatexMath(num);
      const d = formatLatexMath(den);
      if (n === "1" && d === "2") return "½";
      if (n === "1" && d === "3") return "⅓";
      if (n === "1" && d === "4") return "¼";
      if (n === "3" && d === "4") return "¾";
      const wrapN = /[+\-\s]/.test(n) ? `(${n})` : n;
      const wrapD = /[+\-\s]/.test(d) ? `(${d})` : d;
      return `${wrapN}⁄${wrapD}`;
    });
  }

  // Replace \command symbols (longest names first)
  s = s.replace(/\\([A-Za-z]+)/g, (full, cmd: string) => SYMBOLS[cmd] ?? full);

  // Superscripts ^{...} and ^x
  s = s.replace(/\^\{([^{}]+)\}/g, (_, exp: string) => mapScript(formatLatexMath(exp), SUP, "^"));
  s = s.replace(/\^([0-9A-Za-z+\-=()])/g, (_, ch: string) => SUP[ch] ?? `^${ch}`);

  // Subscripts _{...} and _x
  s = s.replace(/_\{([^{}]+)\}/g, (_, sub: string) => mapScript(formatLatexMath(sub), SUB, "_"));
  s = s.replace(/_([0-9A-Za-z+\-=()])/g, (_, ch: string) => SUB[ch] ?? `_${ch}`);

  // Clean spacing commands
  s = s.replace(/\\[,;:!]/g, " ").replace(/\\quad\b/g, "  ").replace(/[{}]/g, "");
  return s;
}

export const MATH_PRESETS: { label: string; latex: string }[] = [
  { label: "Quadratic", latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}" },
  { label: "Gaussian Integral", latex: "\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}" },
  { label: "Series Sum", latex: "\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}" },
  { label: "Euler Identity", latex: "e^{i\\pi} + 1 = 0" },
  { label: "Newton II", latex: "\\sum \\vec{F} = m\\vec{a}" },
  { label: "Derivative", latex: "\\frac{\\partial f}{\\partial x} = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}" },
];
