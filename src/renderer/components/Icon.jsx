export function Icon({ name, size = 20 }) {
  const paths = {
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    file: (
      <>
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <path d="M14 3v6h6M8 13h8M8 17h5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M19 12a7 7 0 1 0-2 5" />
      </>
    ),
    folderAdd: (
      <>
        <path d="M3 7V5h6l2 2h10v13H3z" />
        <path d="M12 11v6m-3-3h6" />
      </>
    ),
    open: (
      <>
        <path d="M14 3H5v18h14v-9M14 3h7v7M21 3l-9 9" />
      </>
    ),
    folder: <path d="M3 7V5h6l2 2h10v13H3z" />,
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="16" cy="17" r="3" />
      </>
    ),
    back: <path d="m14 6-6 6 6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    arrow: <path d="M7 17 17 7M7 7h10v10" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
