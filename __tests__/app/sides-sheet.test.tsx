import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SidesSheet, type Side } from "@/components/sides-sheet"

const sides: Side[] = [
  { _id: "f", name: "+ Frites", price: 3, description: "", imageUrl: null, outOfStock: false },
  { _id: "a", name: "+ Alloco", price: 5, description: "Banane plantain dorée", imageUrl: null, outOfStock: false },
  { _id: "r", name: "+ Riz", price: 2, description: "", imageUrl: null, outOfStock: true },
]

describe("Accompagnements proposés après un plat", () => {
  it("rappelle le plat ajouté et liste les accompagnements sans le « + »", () => {
    render(<SidesSheet dish="Cuisse au four" sides={sides} inCart={() => 0} onAdd={() => {}} onClose={() => {}} />)
    expect(screen.getByText(/Cuisse au four ajouté/)).toBeInTheDocument()
    expect(screen.getByText("Frites")).toBeInTheDocument()
    expect(screen.getByText("Banane plantain dorée · 5,00 €")).toBeInTheDocument()
  })

  it("ajoute un accompagnement et n'en propose pas un épuisé", () => {
    const onAdd = vi.fn()
    render(<SidesSheet dish="Cuisse au four" sides={sides} inCart={() => 0} onAdd={onAdd} onClose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter + Frites" }))
    expect(onAdd).toHaveBeenCalledWith(sides[0])
    expect(screen.queryByRole("button", { name: "Ajouter + Riz" })).toBeNull()
    expect(screen.getByText("Épuisé")).toBeInTheDocument()
  })

  it("affiche « Non merci » puis « Continuer » une fois un accompagnement choisi", () => {
    const onClose = vi.fn()
    const { rerender } = render(<SidesSheet dish="Cuisse au four" sides={sides} inCart={() => 0} onAdd={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByRole("button", { name: "Non merci" }))
    expect(onClose).toHaveBeenCalledTimes(1)
    rerender(<SidesSheet dish="Cuisse au four" sides={sides} inCart={(id) => (id === "f" ? 1 : 0)} onAdd={() => {}} onClose={onClose} />)
    expect(screen.getByRole("button", { name: "Continuer" })).toBeInTheDocument()
  })

  it("se ferme avec Échap", () => {
    const onClose = vi.fn()
    render(<SidesSheet dish="Cuisse au four" sides={sides} inCart={() => 0} onAdd={() => {}} onClose={onClose} />)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })
})
