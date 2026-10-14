import { supabase } from "@/integrations/supabase/client";

export type DocType = "passport" | "drivers_license" | "national_id";

type KycDocPaths = Record<"id_front" | "selfie" | "address_proof", string> & { id_back?: string };

/** Informations exigées par la loi (DOIMV, règle du voyage), envoyées avec les documents. */
export interface KycIdentityInfo {
  birthDate: string;
  addressLine: string;
  city: string;
  province: string;
  postalCode: string;
  occupation: string;
}

async function uploadFile(uid: string, key: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${uid}/${key}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("kyc").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function submitKycDocuments(
  docType: DocType,
  files: { idFront: File; idBack?: File; selfie: File; addressProof: File },
  info: KycIdentityInfo,
): Promise<{ error?: string }> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return { error: "Not authenticated" };

  try {
    const paths: KycDocPaths = {
      id_front: await uploadFile(uid, "id_front", files.idFront),
      selfie: await uploadFile(uid, "selfie", files.selfie),
      address_proof: await uploadFile(uid, "address_proof", files.addressProof),
    };
    if (files.idBack) {
      paths.id_back = await uploadFile(uid, "id_back", files.idBack);
    }

    const { error } = await supabase.from("kyc_verifications").insert({
      user_id: uid,
      provider: "native",
      status: "pending",
      doc_type: docType,
      document_paths: paths,
      birth_date: info.birthDate,
      address_line: info.addressLine.trim(),
      city: info.city.trim(),
      province: info.province,
      postal_code: info.postalCode.trim().toUpperCase(),
      occupation: info.occupation.trim(),
    });
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: (e as Error).message ?? "Upload failed" };
  }
}
