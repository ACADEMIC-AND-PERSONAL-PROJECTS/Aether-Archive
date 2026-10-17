Focus geometry: which elements can take focus inside a container, and which one is next. Pure
functions and one DOM query, no React imports — the effect that binds them to `Tab` lives in
`features/menu/GlassMenu.tsx`.

The trap's boundaries are the reason this is not inline in the component: a wrap-around is a
boundary, and a boundary deserves edge tests (`trap.test.ts`) rather than an expression nobody can
read twice. E3-S2's glass menu is the first inhabitant; a second dialog extends these functions and
the module doc's stated limits rather than adding a second trap.
