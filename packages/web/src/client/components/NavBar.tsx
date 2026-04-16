import { NavLink } from 'react-router-dom'

export function NavBar() {
  return (
    <header>
      <nav className="bg-[#0d0e0d] h-16 flex items-center px-10">
        <span
          className="text-[#75fe04] text-[23px] font-bold"
          style={{ letterSpacing: '3px' }}
        >
          ⬡ HARNESS
        </span>
        <div className="flex-1" />
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `relative flex items-center h-16 px-5 text-[18px] font-semibold ${isActive ? 'text-[#75fe04]' : 'text-[#4f4f4f]'}`
          }
          style={{ letterSpacing: '1px' }}
        >
          {({ isActive }) => (
            <>
              History
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-1 bg-[#75fe04] rounded-t-sm" />
              )}
            </>
          )}
        </NavLink>
        <NavLink
          to="/scil"
          className={({ isActive }) =>
            `relative flex items-center h-16 px-5 text-[18px] font-semibold ${isActive ? 'text-[#75fe04]' : 'text-[#4f4f4f]'}`
          }
          style={{ letterSpacing: '1px' }}
        >
          {({ isActive }) => (
            <>
              SCIL History
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-1 bg-[#75fe04] rounded-t-sm" />
              )}
            </>
          )}
        </NavLink>
        <NavLink
          to="/acil"
          className={({ isActive }) =>
            `relative flex items-center h-16 px-5 text-[18px] font-semibold ${isActive ? 'text-[#75fe04]' : 'text-[#4f4f4f]'}`
          }
          style={{ letterSpacing: '1px' }}
        >
          {({ isActive }) => (
            <>
              ACIL History
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-1 bg-[#75fe04] rounded-t-sm" />
              )}
            </>
          )}
        </NavLink>
        <NavLink
          to="/analytics"
          className={({ isActive }) =>
            `relative flex items-center h-16 px-5 text-[18px] font-semibold ${isActive ? 'text-[#75fe04]' : 'text-[#4f4f4f]'}`
          }
          style={{ letterSpacing: '1px' }}
        >
          {({ isActive }) => (
            <>
              Analytics
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-1 bg-[#75fe04] rounded-t-sm" />
              )}
            </>
          )}
        </NavLink>
      </nav>
      <div className="h-px bg-[#252625]" />
    </header>
  )
}
