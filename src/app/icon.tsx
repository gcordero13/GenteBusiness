import { ImageResponse } from "next/og";
import { buildAppIconElement } from "./appIcon";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function Icon() {
  return new ImageResponse(await buildAppIconElement(size.width), size);
}
