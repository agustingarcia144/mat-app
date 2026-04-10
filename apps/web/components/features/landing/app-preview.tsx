export function AppPreview() {
  return (
    <div className="relative space-y-3 rounded-[1rem] bg-white/5 p-4">
      <div className="flex items-center gap-1.5 text-orange-400">
        <svg
          className="size-5"
          xmlns="http://www.w3.org/2000/svg"
          width="1em"
          height="1em"
          viewBox="0 0 32 32"
        >
          <g fill="none">
            <path
              fill="#ff6723"
              d="M26 19.34c0 6.1-5.05 11.005-11.15 10.641c-6.269-.374-10.56-6.403-9.752-12.705c.489-3.833 2.286-7.12 4.242-9.67c.34-.445.689 3.136 1.038 2.742c.35-.405 3.594-6.019 4.722-7.991a.694.694 0 0 1 1.028-.213C18.394 3.854 26 10.277 26 19.34"
            />
            <path
              fill="#ffb02e"
              d="M23 21.851c0 4.042-3.519 7.291-7.799 7.144c-4.62-.156-7.788-4.384-7.11-8.739C9.07 14.012 15.48 10 15.48 10S23 14.707 23 21.851"
            />
          </g>
        </svg>
        <div className="text-sm font-medium">Plan semanal</div>
      </div>
      <div className="space-y-3">
        <div className="text-foreground border-b border-white/10 pb-3 text-sm font-medium">
          Esta semana completaste más entrenamientos que la anterior.
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="space-x-1">
              <span className="text-foreground align-baseline text-xl font-medium">
                4
              </span>
              <span className="text-muted-foreground text-xs">
                entrenamientos
              </span>
            </div>
            <div className="flex h-5 items-center rounded bg-linear-to-l from-emerald-400 to-indigo-600 px-2 text-xs text-white">
              Esta semana
            </div>
          </div>
          <div className="space-y-1">
            <div className="space-x-1">
              <span className="text-foreground align-baseline text-xl font-medium">
                3
              </span>
              <span className="text-muted-foreground text-xs">
                entrenamientos
              </span>
            </div>
            <div className="text-foreground bg-muted flex h-5 w-2/3 items-center rounded px-2 text-xs dark:bg-white/20">
              Semana anterior
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
