"use client";

import { useActionState } from "react";
import GonderButonu from "@/components/gonder-butonu";
import { para } from "@/lib/format";
import { borcuDevret, type ActionSonuc } from "./actions";

const BOS: ActionSonuc = {};

/**
 * Önceki dönemlerin ödenmemiş kalanını seçili aya taşır.
 *
 * Bilinçli olarak elle: hangi daireyi ne zaman devredeceği yöneticinin
 * kararı. Otomatik olsaydı kiracı ödemeyi yolda göndermişken fatura
 * şişebilirdi.
 */
export default function DevirButonu({
  unitId,
  donem,
  devreden,
  donemEtiketi,
  saltOkunur = false,
}: {
  unitId: string;
  donem: string;
  /** Seçili dönem öncesinden taşınacak toplam. */
  devreden: number;
  donemEtiketi: string;
  saltOkunur?: boolean;
}) {
  const [durum, action] = useActionState(borcuDevret, BOS);

  return (
    <div className="border-t border-red-100 bg-red-100/40 px-4 py-3">
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="unit_id" value={unitId} />
        <input type="hidden" name="donem" value={donem} />

        <p className="text-sm text-red-900">
          Önceki dönemlerden <strong>{para(devreden)}</strong> borç var.
          {donemEtiketi} faturasına taşıyabilirsiniz — eski faturalar kapanır,
          kiracıya tek fatura gider.
        </p>

        <GonderButonu
          varyant="tehlike"
          bekleyen="Devrediliyor…"
          disabled={saltOkunur}
          className="ml-auto"
        >
          {donemEtiketi} faturasına devret
        </GonderButonu>
      </form>

      {durum.hata && <p className="mt-2 text-sm text-red-800">{durum.hata}</p>}
      {durum.basari && (
        <p className="mt-2 text-sm font-medium text-red-900">{durum.basari}</p>
      )}
    </div>
  );
}
