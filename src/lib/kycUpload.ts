// Shared KYC document picker + multipart upload helpers.
//
// OTA-safe: reuses the ALREADY-installed expo-image-picker / expo-document-picker
// (mirrors the payment-proof picker in AuctionWonScreen). No new native modules,
// no expo-file-system — the multipart upload hands fetch the { uri, name, type }
// triple directly, which RN turns into a real file part.

import { Alert } from "react-native";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

// Web origin for the KYC API. Ships in the OTA manifest (extra.webUrl). Must be
// the canonical www host (apex 307-redirects to www and fetch drops the
// Authorization header across that cross-host redirect → 401).
const WEB_URL =
  (Constants.expoConfig?.extra as { webUrl?: string } | undefined)?.webUrl ??
  "https://www.xportacar.com";

// A document the user picked for KYC — a photo from the library OR a file.
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

export type IdSubtype = "passport" | "drivers_license" | "national_id";

const ALLOWED_DOC_TYPES = ["application/pdf", "image/png", "image/jpeg"];

// Normalise the picker's mimeType to one the server accepts. Some pickers report
// "" or "image/jpg"; fall back to the file extension when needed.
function normalizeMime(name: string, mimeType?: string | null): string {
  const t = (mimeType || "").toLowerCase();
  if (t === "application/pdf" || t === "image/png" || t === "image/jpeg") return t;
  if (t === "image/jpg") return "image/jpeg";
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  return "image/jpeg";
}

// Pick a photo from the media library (mirrors AuctionWonScreen.addImage).
// Returns the chosen file, or null when cancelled / permission denied.
export async function pickKycImage(
  t: (key: string, values?: Record<string, string | number>) => string,
): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(t("won.photosDisabledTitle"), t("won.photosDisabledBody"));
    return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const name = a.fileName ?? `kyc-${Date.now()}.jpg`;
  return { uri: a.uri, name, mimeType: normalizeMime(name, a.mimeType) };
}

// Pick a document (PDF/PNG/JPG) via the document picker (mirrors
// AuctionWonScreen.addDocument). Returns null when cancelled.
export async function pickKycDocument(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ALLOWED_DOC_TYPES,
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const name = a.name ?? `kyc-${Date.now()}`;
  return { uri: a.uri, name, mimeType: normalizeMime(name, a.mimeType) };
}

interface UploadOpts {
  // Auth: ONE of these. token = signup uploadToken (no session yet);
  // accessToken = the signed-in user's bearer (Profile re-submit).
  token?: string;
  accessToken?: string;
  personalId: PickedFile;
  idSubtype: IdSubtype;
  tradeLicense?: PickedFile | null;
  isBusiness: boolean;
}

// POST the KYC documents as multipart/form-data to the web endpoint. We DO NOT
// set Content-Type ourselves — fetch derives the multipart boundary.
export async function uploadKycDocs(
  opts: UploadOpts,
): Promise<{ ok: boolean; error?: string }> {
  const { token, accessToken, personalId, idSubtype, tradeLicense, isBusiness } = opts;
  try {
    const fd = new FormData();
    fd.append("personal_id", {
      uri: personalId.uri,
      name: personalId.name,
      type: personalId.mimeType,
    } as unknown as Blob);
    fd.append("id_subtype", idSubtype);
    fd.append("is_business", isBusiness ? "true" : "false");
    if (isBusiness && tradeLicense) {
      fd.append("trade_license", {
        uri: tradeLicense.uri,
        name: tradeLicense.name,
        type: tradeLicense.mimeType,
      } as unknown as Blob);
    }
    if (token) fd.append("token", token);

    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const res = await fetch(`${WEB_URL}/api/kyc/upload`, {
      method: "POST",
      headers,
      body: fd,
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message };
  }
}
