"use client";
// Halaman detail service (rute penuh). Isi sebenarnya ada di komponen
// ServiceDetailView, yang juga dipakai sebagai drawer di canvas project.
import { useParams } from "next/navigation";
import { ServiceDetailView } from "@/components/service-detail";

export default function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ServiceDetailView id={id} variant="page" />;
}
