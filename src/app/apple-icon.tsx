import { ImageResponse } from "next/og";
import { buildAppIconElement } from "./appIcon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(await buildAppIconElement(size.width), size);
}
