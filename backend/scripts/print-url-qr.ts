import QRCode from "qrcode";

async function main() {
  const targetUrl = process.argv[2];

  if (!targetUrl) {
    console.error("Usage: npm run qr:url -- <url>");
    process.exit(1);
  }

  try {
    const qr = await QRCode.toString(targetUrl, {
      type: "terminal",
      errorCorrectionLevel: "M",
      small: true,
    });

    console.log("\nOpen this URL on smartphone:");
    console.log(targetUrl);
    console.log("\nQR Code:\n");
    console.log(qr);
  } catch (error) {
    console.error("Failed to generate QR code.", error);
    process.exit(1);
  }
}

main();
