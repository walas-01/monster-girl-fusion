function CreatePlayer({username, setUsername, onCreate, loading, blocked}) {

    function handleSubmit(event) {
        event.preventDefault();
        onCreate();
    }

    return (
        <form className="p-6 flex flex-col gap-4" onSubmit={handleSubmit}>

            <h1 className="text-3xl font-bold text-white">
                Bienvenido a Monster-G
            </h1>

            <p className="text-gray-300">
                Crea tu jugador para comenzar.
            </p>

            <label htmlFor="player-username">Nombre del jugador</label>

            <input
                id="player-username"
                name="username"
                type="text"
                placeholder="Tu nombre..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="p-3 rounded-lg bg-white text-gray-900"
                required
            />

            <button type="submit" disabled={loading || blocked || !username.trim()}
                className="p-3 rounded-lg bg-indigo-500 text-white font-bold"
            >
                {loading ? "Creando..." : "Crear jugador"}
            </button>

        </form>
    );
}

export default CreatePlayer;
