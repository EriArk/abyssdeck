using Avalonia.Media;

namespace CodexWeb.Companion;

// Semantic palette from web themes.css/materials.css/polymer.css; one layout.
public sealed record Palette(string Name, string Paper, string Canvas, string Surface,
    string Ink, string Muted, string Line, string Accent, string AccentInk, string Soft, string Danger, bool Dark);

public static class Themes
{
    public static readonly string[] Ids = ["organizer", "crt-green", "hitech-2000s", "classic-dark"];
    public static Palette Get(string id) => id switch
    {
        "organizer" => new("Органайзер", "#fffdf5", "#eae6d9", "#faf7ed", "#2c3830", "#687568", "#d4d2bf", "#3e6b58", "#fffef8", "#dae6d9", "#a14336", false),
        "crt-green" => new("Зелёный терминал", "#040f08", "#061009", "#0a1b10", "#aaf5b8", "#82bb93", "#2c6140", "#9affae", "#072410", "#173e24", "#ffba97", true),
        "hitech-2000s" => new("Hi-Tech 2000s", "#fcfcf5", "#edf2e9", "#f4f7ef", "#193f3b", "#526d63", "#b1c2b8", "#1c625d", "#f8fff8", "#d4e8df", "#a24337", false),
        _ => new("Классическая тёмная", "#15181d", "#101216", "#1e2229", "#e3e6ec", "#a1a8b4", "#343b46", "#b3c7e3", "#152234", "#293343", "#ffaba4", true)
    };
    public static IBrush Brush(string color) => new SolidColorBrush(Color.Parse(color));
}
