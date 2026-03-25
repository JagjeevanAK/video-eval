import RoomDetail from "@/screens/RoomDetail";

interface RoomDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function RoomDetailPage({ params }: RoomDetailPageProps) {
  const { id } = await params;

  return <RoomDetail roomId={id} />;
}
