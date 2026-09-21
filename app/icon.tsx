import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/**
 * Bina/apartman simgesi — kapı + iki pencere. Kira takip uygulaması için
 * "K" harfinden daha anlaşılır: küçük favicon boyutunda bile ne olduğu belli.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          borderRadius: 96,
        }}
      >
        <svg width="304" height="304" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 21V9.5a1 1 0 0 1 .4-.8l7-5.25a1 1 0 0 1 1.2 0l7 5.25a1 1 0 0 1 .4.8V21a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"
            fill="white"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
