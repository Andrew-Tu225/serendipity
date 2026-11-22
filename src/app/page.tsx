import SerendipityApp from "@/components/serendipity/SerendipityApp";

// The client session gate defers this segment until identity is verified.
export const instant = false;

export default function Home() {
  return <SerendipityApp />;
}
