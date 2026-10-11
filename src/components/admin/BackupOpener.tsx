import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, FileArchive, FileText, KeyRound, Loader2, Lock, X } from "lucide-react";
import { C, FONT, btnGhost, btnPrimary, inputStyle, numeric } from "@/components/admin/adminTheme";
import { BackupOpenError, openBackup, type OpenStep, type OpenedBackup } from "@/lib/backupOpen";

/*
 * « Tester une sauvegarde » : on choisit le fichier .gpg téléchargé depuis
 * GitHub, on tape la phrase secrète, et l'archive est ouverte dans ce
 * navigateur (rien n'est envoyé). Sert à vérifier qu'une sauvegarde s'ouvre
 * vraiment, et à regarder son contenu sans ordinateur.
 */

const STEP_LABEL: Record<OpenStep, string> = {
  decrypt: "Déchiffrement avec la phrase secrète…",
  unzip: "Décompression…",
  verify: "Vérification des empreintes de chaque fichier…",
};

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif",
};
const typeOf = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_TYPES[ext] ?? (ext === "pdf" ? "application/pdf" : ext === "json" || ext === "sql" ? "text/plain;charset=utf-8" : "application/octet-stream");
};
const size = (b: number) =>
  b < 1024 ? `${b} o` : b < 1048576 ? `${(b / 1024).toLocaleString("fr-CA", { maximumFractionDigits: 0 })} Ko` : `${(b / 1048576).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} Mo`;

const DB_LABELS: Record<string, string> = {
  "db/public.dump": "Toute la base (clients, commandes, registres…)",
  "db/auth-data.sql": "Comptes de connexion",
  "db/storage-data.sql": "Index des fichiers",
  "db/cron-jobs.sql": "Tâches planifiées",
  "manifest.json": "Résumé de la sauvegarde",
};

export default function BackupOpener({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [phrase, setPhrase] = useState("");
  const [step, setStep] = useState<OpenStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OpenedBackup | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Liens locaux (blob:) vers chaque fichier, libérés à la fermeture.
  const urls = useMemo(() => {
    const map = new Map<string, string>();
    result?.entries.forEach((e) => map.set(e.path, URL.createObjectURL(new Blob([e.data as Uint8Array<ArrayBuffer>], { type: typeOf(e.path) }))));
    return map;
  }, [result]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const run = async () => {
    if (!file || !phrase) return;
    setError(null);
    setResult(null);
    try {
      const r = await openBackup(file, phrase, setStep);
      setResult(r);
      setPhrase("");
    } catch (e) {
      setError(e instanceof BackupOpenError ? e.message : "Ouverture impossible. Réessayez, ou vérifiez que le fichier est complet.");
    } finally {
      setStep(null);
    }
  };

  const close = () => {
    setResult(null);
    setPhrase("");
    setFile(null);
    onClose();
  };

  const files = result?.entries.filter((e) => e.path.startsWith("storage/")) ?? [];
  const dbFiles = result?.entries.filter((e) => DB_LABELS[e.path]) ?? [];
  const tables = result?.manifest?.tables_after ?? {};
  const rows = Object.values(tables).reduce((n, c) => n + c, 0);
  const allGood = result && result.mismatched.length === 0 && result.missing.length === 0 && result.checked > 0;

  return (
    <div style={{ margin: "0 16px 16px", border: `1px solid ${C.bd}`, borderRadius: 12, background: C.l2, fontFamily: FONT, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderBottom: `1px solid ${C.bds}` }}>
        <p style={{ margin: 0, fontSize: 13, color: C.t1, display: "flex", alignItems: "center", gap: 8 }}>
          <KeyRound style={{ width: 14, height: 14, color: C.t3 }} /> Tester une sauvegarde
        </p>
        <button type="button" onClick={close} aria-label="Fermer et effacer" style={{ background: "none", border: "none", color: C.t3, cursor: "pointer", padding: 4, display: "flex" }}>
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {!result && (
        <div style={{ padding: 14, display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: C.t2 }}>
            Téléchargez une sauvegarde depuis GitHub (Releases), choisissez-la ici et tapez votre phrase secrète.
            L'ouverture se fait <b>dans ce navigateur</b> : rien n'est envoyé, et tout est effacé quand vous fermez.
          </p>

          <input ref={inputRef} type="file" style={{ display: "none" }}
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={!!step}
            style={{ ...btnGhost, height: "auto", minHeight: 44, padding: "10px 14px", justifyContent: "flex-start", whiteSpace: "normal", textAlign: "left", color: file ? C.t1 : C.t2 }}>
            <FileArchive style={{ width: 16, height: 16, flexShrink: 0, color: C.t3 }} />
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {file ? <>{file.name} <span style={{ color: C.t3 }}>· {size(file.size)}</span></> : "Choisir le fichier ooble-backup-….gpg"}
            </span>
          </button>

          <form onSubmit={(e) => { e.preventDefault(); run(); }} style={{ display: "grid", gap: 12 }}>
            <input type="password" value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Phrase secrète"
              autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} disabled={!!step} style={{ ...inputStyle, fontSize: 16 }} />
            <button type="submit" disabled={!file || !phrase || !!step}
              style={{ ...btnPrimary, height: 42, justifyContent: "center", opacity: !file || !phrase || step ? 0.5 : 1, cursor: !file || !phrase || step ? "default" : "pointer" }}>
              {step ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> {STEP_LABEL[step]}</> : <><Lock style={{ width: 14, height: 14 }} /> Ouvrir la sauvegarde</>}
            </button>
          </form>

          {error && (
            <p role="alert" style={{ margin: 0, padding: "10px 12px", borderRadius: 9, fontSize: 12.5, background: C.dangerBg, border: `1px solid ${C.dangerBd}`, color: C.dangerText, display: "flex", gap: 8 }}>
              <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} /> {error}
            </p>
          )}
        </div>
      )}

      {result && (
        <div style={{ padding: 14, display: "grid", gap: 16 }}>
          <div style={{
            padding: "12px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.55, display: "flex", gap: 10, alignItems: "flex-start",
            background: allGood ? C.successBg : C.dangerBg, border: `1px solid ${allGood ? C.successBd : C.dangerBd}`, color: allGood ? C.successText : C.dangerText,
          }}>
            {allGood ? <Check style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }} strokeWidth={2.2} /> : <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }} />}
            <span>
              {allGood
                ? <>La sauvegarde s'ouvre correctement : phrase acceptée, {result.checked} fichiers intacts (empreintes vérifiées).</>
                : <>La sauvegarde s'ouvre, mais {result.mismatched.length + result.missing.length} fichier(s) ne correspondent pas : {[...result.mismatched, ...result.missing].slice(0, 3).join(", ")}.</>}
              {result.manifest?.created_utc && <> Faite le {result.manifest.created_utc.slice(0, 10)}.</>}
            </span>
          </div>

          <section>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: C.t3 }}>
              Pièces d'identité et documents · {files.length} fichiers
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 8 }}>
              {files.map((f) => {
                const url = urls.get(f.path);
                const isImage = typeOf(f.path).startsWith("image/");
                const name = f.path.split("/").pop();
                return (
                  <a key={f.path} href={url} target="_blank" rel="noopener noreferrer" title={f.path}
                    style={{ display: "block", textDecoration: "none", border: `1px solid ${C.bds}`, borderRadius: 8, overflow: "hidden", background: C.l1 }}>
                    <div style={{ aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", background: C.l3 }}>
                      {isImage
                        ? <img src={url} alt={name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <FileText style={{ width: 22, height: 22, color: C.t3 }} />}
                    </div>
                    <p style={{ margin: 0, padding: "5px 7px", fontSize: 10.5, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
                  </a>
                );
              })}
            </div>
          </section>

          <section>
            <p style={{ margin: "0 0 4px", fontSize: 12, color: C.t3 }}>
              Base de données · {Object.keys(tables).length} tables · {rows.toLocaleString("fr-CA")} lignes
            </p>
            {dbFiles.map((f) => (
              <div key={f.path} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: `1px solid ${C.bds}`, fontSize: 12.5 }}>
                <span style={{ color: C.t1, minWidth: 0 }}>
                  {DB_LABELS[f.path]} <span style={{ color: C.t3 }}>· {f.path}</span>
                </span>
                <span style={{ ...numeric, color: C.t3, flexShrink: 0 }}>{size(f.size)}</span>
              </div>
            ))}
          </section>

          <button type="button" onClick={close} style={{ ...btnGhost, justifyContent: "center", height: 40 }}>
            Fermer et effacer de l'écran
          </button>
        </div>
      )}
    </div>
  );
}
