import { useParams } from "react-router-dom";
import { ShopProfileContent } from "@/components/ShopProfileContent";

export default function ShopDetail() {
  const { id } = useParams();

  if (!id) return null;

  return (
    <div className="container mx-auto">
      <ShopProfileContent id={id} />
    </div>
  );
}
