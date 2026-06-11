export function GET() {
  return Response.json({
    ok: true,
    service: "news-agg",
  });
}
